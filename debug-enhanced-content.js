// Simple test to debug enhanced content detection
const testMessage = {
  messageId: 'test-123',
  text: 'Here is an image: https://picsum.photos/300/200',
  isCreatedByUser: false
};

// Simulate the ContentParser logic
const imagePattern = /https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|svg|bmp|tiff|ico)(?:\?[^\s]*)?/gi;
const genericUrlPattern = /https?:\/\/[^\s]+/gi;

console.log('Testing message:', testMessage.text);
console.log('Image pattern test:', imagePattern.test(testMessage.text));

// Reset regex
imagePattern.lastIndex = 0;
const imageMatches = testMessage.text.match(imagePattern);
console.log('Image matches:', imageMatches);

const genericMatches = testMessage.text.match(genericUrlPattern);
console.log('Generic URL matches:', genericMatches);

// Test the isLikelyImageUrl logic
function isLikelyImageUrl(url) {
  const imageKeywords = ['image', 'img', 'photo', 'picture', 'pic', 'avatar', 'thumbnail', 'thumb'];
  const lowerUrl = url.toLowerCase();
  
  if (imageKeywords.some(keyword => lowerUrl.includes(keyword))) {
    return true;
  }
  
  const imageHosts = [
    'imgur.com', 'i.imgur.com',
    'cdn.discordapp.com',
    'images.unsplash.com',
    'picsum.photos',
    'via.placeholder.com',
    'placehold.it',
    'dummyimage.com',
    'gravatar.com',
    'githubusercontent.com'
  ];
  
  if (imageHosts.some(host => lowerUrl.includes(host))) {
    return true;
  }
  
  return true; // Aggressive detection
}

if (genericMatches) {
  genericMatches.forEach(url => {
    console.log(`URL: ${url}, isLikelyImage: ${isLikelyImageUrl(url)}`);
  });
}