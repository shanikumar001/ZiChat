import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  username: string;
  password?: string;
  bio?: string;
  profilePhoto?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    username: { type: String, required: true, unique: true, lowercase: true, index: true },
    password: { type: String, required: true },
    bio: { type: String, default: '' },
    profilePhoto: { type: String, default: '' },
  },
  { timestamps: true }
);

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
