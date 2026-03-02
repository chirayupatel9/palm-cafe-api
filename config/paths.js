/**
 * Shared filesystem paths used for uploads and static serving.
 * Using a single module ensures upload handlers and express.static serve the same directory.
 */
const path = require('path');

const publicImagesDir = path.join(__dirname, '..', 'public', 'images');

module.exports = { publicImagesDir };
