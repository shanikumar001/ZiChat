import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, message: 'No file provided' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload to Cloudinary using upload_stream
    const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'zichat_media',
          resource_type: 'auto',
        },
        (error, result) => {
          if (error || !result) return reject(error || new Error('Upload failed'));
          resolve(result);
        }
      );
      stream.end(buffer);
    }).catch((err) => {
      console.warn('Cloudinary upload stream failed or keys unconfigured, returning data URL:', err);
      // Fallback data URI if Cloudinary keys are not fully set
      const base64 = buffer.toString('base64');
      const mime = file.type || 'application/octet-stream';
      return { secure_url: `data:${mime};base64,${base64}` };
    });

    return NextResponse.json({
      success: true,
      url: uploadResult.secure_url,
      fileName: file.name,
      fileSize: file.size,
    });
  } catch (error) {
    console.error('Media upload error:', error);
    return NextResponse.json({ success: false, message: 'Upload failed' }, { status: 500 });
  }
}
