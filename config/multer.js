const multer = require('multer');

// Excel file uploads (menu import, inventory import)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel' ||
        file.originalname.endsWith('.xlsx') ||
        file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'));
    }
  }
});

// ZIP file uploads (menu import with images)
const zipUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit for ZIP files (can contain images)
  },
  fileFilter: (req, file, cb) => {
    const isZip = file.originalname.toLowerCase().endsWith('.zip') ||
                  file.mimetype === 'application/zip' ||
                  file.mimetype === 'application/x-zip-compressed' ||
                  file.mimetype === 'application/x-zip' ||
                  file.mimetype.includes('zip');

    if (isZip) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Expected ZIP file, got: ${file.mimetype || 'unknown'}`));
    }
  }
});

// Image uploads (logo, hero, promo, menu item images)
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

module.exports = { multer, upload, zipUpload, imageUpload };
