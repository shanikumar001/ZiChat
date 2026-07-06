import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMessage extends Document {
  senderId: string;
  receiverId: string;
  groupId?: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: string;
  fileName?: string;
  fileSize?: number;
  status: 'sent' | 'delivered' | 'seen';
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    senderId: { type: String, required: true, index: true },
    receiverId: { type: String, default: '', index: true },
    groupId: { type: String, default: '', index: true },
    text: { type: String, default: '' },
    mediaUrl: { type: String, default: '' },
    mediaType: { type: String, default: '' },
    fileName: { type: String, default: '' },
    fileSize: { type: Number, default: 0 },
    status: { type: String, enum: ['sent', 'delivered', 'seen'], default: 'sent' },
  },
  { timestamps: true }
);

delete mongoose.models.Message;
const Message: Model<IMessage> = mongoose.models.Message || mongoose.model<IMessage>('Message', MessageSchema);

export default Message;
