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
});
