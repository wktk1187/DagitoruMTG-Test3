import express, { Request, Response, RequestHandler } from 'express';
import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { SpeechClient, protos } from '@google-cloud/speech';
import { Storage } from '@google-cloud/storage';
import * as admin from 'firebase-admin';

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

const TEMP_DIR = path.join(__dirname, '..', '.tmp'); 
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const speechClient = new SpeechClient();
const storage = new Storage();

const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;
if (!GCS_BUCKET_NAME) {
  console.error('GCS_BUCKET_NAME environment variable is not set. GCS operations will fail.');
  // For critical env vars, you might want to throw an error:
  // throw new Error("GCS_BUCKET_NAME environment variable is not set.");
}

if (!admin.apps.length) {
  admin.initializeApp();
}
const firestore = admin.firestore();

app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  res.status(200).send('Video Processing Service is running!');
});

const postHandler: RequestHandler = async (req, res) => {
  console.log('Received Pub/Sub message POST request.');

  let tempVideoPath: string | null = null;
  let tempAudioPath: string | null = null;
  let gcsAudioUri: string | null = null;
  let transcript: string | null = null;
  let operationName: string | undefined = undefined;
  let pubSubMessageData: any = null;

  try {
    console.log('Attempting to parse Pub/Sub message...');
    const pubSubMessage = req.body.message;
    if (!pubSubMessage || !pubSubMessage.data) {
      console.error('Invalid Pub/Sub message format in req.body.message');
      res.status(400).send('Bad Request: Invalid Pub/Sub message format');
      return;
    }

    const messageDataString = Buffer.from(pubSubMessage.data, 'base64').toString('utf-8');
    pubSubMessageData = JSON.parse(messageDataString);
    console.log('Successfully decoded message data:', pubSubMessageData);

    const { slackFileDownloadUrl, slackBotToken, originalFileId, originalFileExtension, jobId } = pubSubMessageData;

    if (!slackFileDownloadUrl || !slackBotToken || !originalFileId) {
      console.error('Missing required fields in messageData for download:', pubSubMessageData);
      res.status(400).send('Bad Request: Missing download URL, token, or file ID.');
      return;
    }

    let originalMessageText = pubSubMessageData.originalMessageText;
    let usedFirestoreFallback = false;
    if (originalMessageText === undefined || originalMessageText === null) {
      if (jobId) {
        const jobDoc = await firestore.doc(`processedMeetingJobs/${jobId}`).get();
        if (jobDoc.exists && jobDoc.data()?.originalMessageText !== undefined) {
          originalMessageText = jobDoc.data()?.originalMessageText;
          usedFirestoreFallback = true;
        }
      }
      if (originalMessageText === undefined || originalMessageText === null) {
        console.warn('originalMessageText missing, even after Firestore fallback', { jobId });
        res.status(202).json({ message: 'Awaiting messageText event', jobId });
        return;
      }
    }

    if (jobId) {
      await firestore.doc(`processedMeetingJobs/${jobId}`).set({
        ...pubSubMessageData,
        originalMessageText,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    console.log(JSON.stringify({
      jobId,
      usedFirestoreFallback,
      originalMessageTextLength: originalMessageText?.length || 0,
      event: 'messageTextChecked',
    }));

    pubSubMessageData.originalMessageText = originalMessageText;

    console.log(`Attempting to download video from: ${slackFileDownloadUrl}`);
    const downloadResponse = await axios({
      method: 'get',
      url: slackFileDownloadUrl,
      responseType: 'stream',
      headers: {
        'Authorization': `Bearer ${slackBotToken}`
      }
    });
    console.log('Axios download request completed.');

    const fileExtension = originalFileExtension || 'mp4';
    const tempFileName = `video_${originalFileId}_${randomUUID()}.${fileExtension}`;
    tempVideoPath = path.join(TEMP_DIR, tempFileName);
    console.log(`Writing video to temporary file: ${tempVideoPath}`);

    const writer = fs.createWriteStream(tempVideoPath);
    downloadResponse.data.pipe(writer);

    await new Promise<void>((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', (err) => reject(new Error('File write stream error: ' + err.message)));
    });
    console.log(`Video downloaded successfully to: ${tempVideoPath}`);

    if (!tempVideoPath || !fs.existsSync(tempVideoPath)) {
        console.error('Temporary video file not found before ffmpeg.');
        throw new Error('Temporary video file not found for ffmpeg processing.');
    }
    const videoFileNameWithoutExt = path.basename(tempVideoPath, path.extname(tempVideoPath));
    tempAudioPath = path.join(TEMP_DIR, `${videoFileNameWithoutExt}.wav`);
    console.log(`Starting ffmpeg to extract audio to: ${tempAudioPath}`);

    const ffmpeg = spawn('ffmpeg', [
      '-i', tempVideoPath,
      '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1',
      tempAudioPath
    ]);

    await new Promise<void>((resolve, reject) => {
      let ffmpegOutput = '';
      ffmpeg.stdout.on('data', (data) => { ffmpegOutput += data.toString(); });
      ffmpeg.stderr.on('data', (data) => { ffmpegOutput += data.toString(); });
      ffmpeg.on('close', (code) => {
        console.log(`ffmpeg process exited with code ${code}`);
        console.log('ffmpeg output:\n', ffmpegOutput);
        if (code === 0) {
          if (fs.existsSync(tempAudioPath!)) {
            console.log(`Audio extracted successfully to: ${tempAudioPath}`);
            resolve();
          } else {
            console.error('ffmpeg exited successfully but output audio file not found.');
            reject(new Error('ffmpeg output file not found. Output: ' + ffmpegOutput));
          }
        } else {
          reject(new Error(`ffmpeg process exited with code ${code}. Output: ` + ffmpegOutput));
        }
      });
      ffmpeg.on('error', (err) => {
        console.error('Failed to start ffmpeg process:', err);
        reject(err);
      });
    });
    console.log(`Audio extracted successfully to: ${tempAudioPath}`);

    if (!tempAudioPath || !fs.existsSync(tempAudioPath) || !GCS_BUCKET_NAME) {
      throw new Error('Temporary audio file not found for GCS upload or GCS_BUCKET_NAME not set.');
    }
    const gcsFileName = `audio/${path.basename(tempAudioPath)}`;
    console.log(`Uploading ${tempAudioPath} to GCS bucket ${GCS_BUCKET_NAME} as ${gcsFileName}`);
    await storage.bucket(GCS_BUCKET_NAME).upload(tempAudioPath, { destination: gcsFileName });
    gcsAudioUri = `gs://${GCS_BUCKET_NAME}/${gcsFileName}`;
    console.log(`Audio uploaded successfully to: ${gcsAudioUri}`);

    console.log(`Starting long-running Speech-to-Text for: ${gcsAudioUri}`);
    const audio = { uri: gcsAudioUri };
    const config = {
      encoding: 'LINEAR16' as const,
      sampleRateHertz: 16000,
      languageCode: 'ja-JP',
      enableAutomaticPunctuation: true,
    };
    const request = { audio: audio, config: config };
    const [operation] = await speechClient.longRunningRecognize(request);
    operationName = operation.name;
    console.log('Speech-to-Text long-running operation started:', operationName);
    const [longRunningResponse] = await operation.promise();
    console.log('Speech-to-Text long-running operation completed.');

    if (longRunningResponse.results && longRunningResponse.results.length > 0) {
      transcript = longRunningResponse.results
        .map((result: protos.google.cloud.speech.v1.ISpeechRecognitionResult) =>
          result.alternatives && result.alternatives[0].transcript
        )
        .join('\n');
      console.log('Transcript:\n', transcript);
    } else {
      console.log('No transcription results from Speech-to-Text API.');
      transcript = "";
    }

    const callbackUrl = process.env.CALLBACK_TO_VERCEL_URL;
    if (!callbackUrl) {
      console.warn('CALLBACK_TO_VERCEL_URL is not set. Skipping callback to Vercel.');
    } else {
      const callbackPayload = {
        ...pubSubMessageData,
        transcript: transcript,
        speechToTextOperationName: operationName,
        gcsAudioUri: gcsAudioUri,
      };
      console.log(`Sending callback to Vercel: ${callbackUrl} with payload - JobId: ${pubSubMessageData.jobId}`);
      try {
        await axios.post(callbackUrl, callbackPayload, {
          headers: {
            'Content-Type': 'application/json',
          }
        });
        console.log('Callback to Vercel successful for JobId:', pubSubMessageData.jobId);
      } catch (callbackError: any) {
        console.error('Error sending callback to Vercel for JobId:', pubSubMessageData.jobId, callbackError.message);
        if (callbackError.response) {
          console.error('Callback error response data:', callbackError.response.data);
        }
      }
    }

    res.status(200).send(`Message processed. Transcript: ${transcript ? 'Created' : 'Not Created'}. Operation: ${operationName || 'N/A'}`);

  } catch (error: any) {
    console.error('!!!!!!!!!! Main catch block error !!!!!!!!!!!');
    console.error('Error Name:', error.name);
    console.error('Error Message:', error.message);
    if (error.response && error.response.data) { console.error('Axios Error Data:', error.response.data); }
    if (error.response && error.response.status) { console.error('Axios Error Status:', error.response.status); }
    if (error.response && error.response.headers) { console.error('Axios Error Headers:', error.response.headers); }
    if (error.code && error.details) {
        console.error('GCP API Error Code:', error.code);
        console.error('GCP API Error Details:', error.details);
    }
    console.error('Error Stack:', error.stack);

    res.status(500).send('Internal Server Error during processing.');
    return;
  } finally {
    console.log('Entered finally block. Cleaning up temporary files...');
    if (tempVideoPath && fs.existsSync(tempVideoPath)) {
      try {
        console.log(`Deleting temporary video file: ${tempVideoPath}`);
        fs.unlinkSync(tempVideoPath);
        console.log('Temporary video file deleted.');
      } catch (e) {
        console.error(`Error deleting temp video file ${tempVideoPath}:`, e);
      }
    }
    if (tempAudioPath && fs.existsSync(tempAudioPath)) {
      try {
        console.log(`Deleting temporary audio file: ${tempAudioPath}`);
        fs.unlinkSync(tempAudioPath);
        console.log('Temporary audio file deleted.');
      } catch (e) {
        console.error(`Error deleting temp audio file ${tempAudioPath}:`, e);
      }
    }
    console.log('Temporary local file cleanup attempt finished.');
  }
};

app.post('/', postHandler);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
}); 