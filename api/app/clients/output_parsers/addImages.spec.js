let addImages = require('./addImages');

describe('addImages', () => {
  let intermediateSteps;
  let responseMessage;
  let options;

  beforeEach(() => {
    intermediateSteps = [];
    responseMessage = { text: '' };
    options = { debug: false };
    this.options = options;
    addImages = addImages.bind(this);
  });

  it('should handle null or undefined parameters', () => {
    addImages(null, responseMessage);
    expect(responseMessage.text).toBe('');

    addImages(intermediateSteps, null);
    expect(responseMessage.text).toBe('');

    addImages(null, null);
    expect(responseMessage.text).toBe('');
  });

  it('should append correct image markdown if not present in responseMessage', () => {
    intermediateSteps.push({ observation: '![desc](/images/test.png)' });
    addImages(intermediateSteps, responseMessage);
    expect(responseMessage.text).toBe('\n![desc](/images/test.png)');
  });

  it('should not append image markdown if already present in responseMessage', () => {
    responseMessage.text = '![desc](/images/test.png)';
    intermediateSteps.push({ observation: '![desc](/images/test.png)' });
    addImages(intermediateSteps, responseMessage);
    expect(responseMessage.text).toBe('![desc](/images/test.png)');
  });

  it('should correct and append image markdown with erroneous URL', () => {
    responseMessage.text = '![desc](sandbox:/images/test.png)';
    intermediateSteps.push({ observation: '![desc](/images/test.png)' });
    addImages(intermediateSteps, responseMessage);
    expect(responseMessage.text).toBe('![desc](/images/test.png)');
  });

  it('should correct multiple erroneous URLs in responseMessage', () => {
    responseMessage.text =
      '![desc1](sandbox:/images/test1.png) ![desc2](version:/images/test2.png)';
    intermediateSteps.push({ observation: '![desc1](/images/test1.png)' });
    intermediateSteps.push({ observation: '![desc2](/images/test2.png)' });
    addImages(intermediateSteps, responseMessage);
    expect(responseMessage.text).toBe('![desc1](/images/test1.png) ![desc2](/images/test2.png)');
  });

  it('should not append non-image markdown observations', () => {
    intermediateSteps.push({ observation: '[desc](/images/test.png)' });
    addImages(intermediateSteps, responseMessage);
    expect(responseMessage.text).toBe('');
  });

  it('should handle multiple observations', () => {
    intermediateSteps.push({ observation: '![desc1](/images/test1.png)' });
    intermediateSteps.push({ observation: '![desc2](/images/test2.png)' });
    addImages(intermediateSteps, responseMessage);
    expect(responseMessage.text).toBe('\n![desc1](/images/test1.png)\n![desc2](/images/test2.png)');
  });

  it('should not append if observation does not contain image markdown', () => {
    intermediateSteps.push({ observation: 'This is a test observation without image markdown.' });
    addImages(intermediateSteps, responseMessage);
    expect(responseMessage.text).toBe('');
  });

  it('should append correctly from a real scenario', () => {
    responseMessage.text =
      'Here is the generated image based on your request. It depicts a surreal landscape filled with floating musical notes. The style is impressionistic, with vibrant sunset hues dominating the scene. At the center, there\'s a silhouette of a grand piano, adding a dreamy emotion to the overall image. This could serve as a unique and creative music album cover. Would you like to make any changes or generate another image?';
    const originalText = responseMessage.text;
    const imageMarkdown = '![generated image](/images/img-RnVWaYo2Yg4x3e0isICiMuf5.png)';
    intermediateSteps.push({ observation: imageMarkdown });
    addImages(intermediateSteps, responseMessage);
    expect(responseMessage.text).toBe(`${originalText}\n${imageMarkdown}`);
  });

  it('should extract only image markdowns when there is text between them', () => {
    const markdownWithTextBetweenImages = `
      ![image1](/images/image1.png)
      Some text between images that should not be included.
      ![image2](/images/image2.png)
      More text that should be ignored.
      ![image3](/images/image3.png)
    `;
    intermediateSteps.push({ observation: markdownWithTextBetweenImages });
    addImages(intermediateSteps, responseMessage);
    expect(responseMessage.text).toBe('\n![image1](/images/image1.png)');
  });

  it('should only return the first image when multiple images are present', () => {
    const markdownWithMultipleImages = `
      ![image1](/images/image1.png)
      ![image2](/images/image2.png)
      ![image3](/images/image3.png)
    `;
    intermediateSteps.push({ observation: markdownWithMultipleImages });
    addImages(intermediateSteps, responseMessage);
    expect(responseMessage.text).toBe('\n![image1](/images/image1.png)');
  });

  it('should not include any text or metadata surrounding the image markdown', () => {
    const markdownWithMetadata = `
      Title: Test Document
      Author: John Doe
      ![image1](/images/image1.png)
      Some content after the image.
      Vector values: [0.1, 0.2, 0.3]
    `;
    intermediateSteps.push({ observation: markdownWithMetadata });
    addImages(intermediateSteps, responseMessage);
    expect(responseMessage.text).toBe('\n![image1](/images/image1.png)');
  });

  it('should handle complex markdown with multiple images and only return the first one', () => {
    const complexMarkdown = `
      # Document Title
      
      ## Section 1
      Here's some text with an embedded image:
      ![image1](/images/image1.png)
      
      ## Section 2
      More text here...
      ![image2](/images/image2.png)
      
      ### Subsection
      Even more content
      ![image3](/images/image3.png)
    `;
    intermediateSteps.push({ observation: complexMarkdown });
    addImages(intermediateSteps, responseMessage);
    expect(responseMessage.text).toBe('\n![image1](/images/image1.png)');
  });
});
