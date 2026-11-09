// server/src/controllers/uploadController.js

const cloudinary = require('cloudinary').v2;

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_SECRET_KEY
});

const streamUpload = (buffer) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(
    {
      folder: 'globallimos_apparel',
      resource_type: 'image',
      transformation: [{ width: 2000, height: 2000, crop: 'limit', quality: 'auto' }],
    },
    (err, result) => (err ? reject(err) : resolve(result))
  );
  stream.end(buffer);
});

exports.uploadApparelLogo = async (req, res) => {
  try {
    
    if(!req.file) {
      return res.status(400).json({ success: false, message: 'No image data received.' });
    }

    const uploadResponse = await streamUpload(req.file.buffer);
    // Cloudinary returns a publicly accessible, secure URL
    res.status(200).json({ 
      success: true, 
      url: uploadResponse.secure_url 
    });

  } catch (error) {
    console.error('Cloudinary Upload error:', error);
    res.status(500).json({ success: false, message: 'Upload failed.' });
  }
};