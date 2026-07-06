import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IGroup extends Document {
  name: string;
  description?: string;
  icon?: string;
  creatorId: string;
  members: string[];
  adminIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

const GroupSchema = new Schema<IGroup>(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    icon: { type: String, default: '' },
    creatorId: { type: String, required: true, index: true },
    members: [{ type: String, required: true, index: true }],
    adminIds: [{ type: String, required: true }],
  },
  { timestamps: true }
);

const Group: Model<IGroup> = mongoose.models.Group || mongoose.model<IGroup>('Group', GroupSchema);

export default Group;
