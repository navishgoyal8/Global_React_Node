// server/src/controllers/uploadController.js

const cloudinary = require('cloudinary').v2;

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_SECRET_KEY
});

exports.uploadApparelLogo = async (req, res) => {
  try {
    const { dataUrl } = req.body || {};
    
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.includes(',')) {
      return res.status(400).json({ success: false, message: 'No image data received.' });
    }

    // Upload the raw Base64 Data URI directly to Cloudinary
    const uploadResponse = await cloudinary.uploader.upload(dataUrl, {
      folder: 'globallimos_apparel', // Groups your files in a specific folder
      resource_type: 'image'
    });

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