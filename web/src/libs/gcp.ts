import { Storage } from '@google-cloud/storage';
import { PubSub } from '@google-cloud/pubsub';

export const storage = new Storage();
export const pubsub = new PubSub(); 