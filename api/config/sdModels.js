const { default: axios } = require('axios');

/**
 * Runpod API hander
 */
const runpodApi = axios.create({
  baseURL: 'https://api.runpod.ai/v2/',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.RUNPOD_API_KEY}`,
  },
});

const getSdApiId = (model) => {
  let apiId = '';
  switch (model) {
    case 'AUTOMATIC1111':
      apiId = process.env.SD_AUTOMATIC1111_ID;
      break;
    case 'Stable Diffusion XL':
      apiId = process.env.SD_XL_ID;
      break;
    case 'SD Open Journey':
      apiId = process.env.SD_OPEN_JOURNEY_ID;
      break;
    case 'SD Anything V5':
      apiId = process.env.SD_ANYTHING_V5_ID;
      break;
    case 'SD Realistic Vision':
      apiId = process.env.SD_REALISTIC_VERSION_ID;
  }
  return apiId;
};

/**
 *
 * @param {string} model
 * @param {string} text
 * @description Generate the image using runpod with async
 * @returns
 */
const generateSdImage = async (model, text) => {
  const promptParts = text.split('--no', 2);
  let intervalId;
  try {
    const axiosResponse = await runpodApi({
      url: `/${getSdApiId(model)}/run`,
      data: {
        input: {
          prompt: promptParts[0] ? promptParts[0] : '',
          negative_prompt: promptParts[1] ? promptParts[1] : '',
          seed: -1,
          cfg_scale: 7.5,
          sampler_index: 'DDIM',
          num_inference_steps: 35,
          email: 'melodyxpot@gmail.com',
        },
      },
    });
    console.log('Runpod QUEUE Procced => ', axiosResponse.data.id);

    return new Promise((resolve, reject) => {
      try {
        intervalId = setInterval(async function () {
          const response = await runpodApi({
            url: `/${getSdApiId(model)}/status/${axiosResponse.data.id}/`,
          });

          if (response.data.status == 'COMPLETED') {
            clearInterval(intervalId);
            console.log('queue completed');

            const imageData = response.data.output.images[0];
            if (!imageData) {
              reject(response.data.output);
            }

            resolve(imageData);
          }
        }, 1000);
      } catch (error) {
        reject(error);
      }
    });
  } catch (error) {
    clearInterval(intervalId);
    throw new Error(`Runpod api error :=> ${error}`);
  }
};

module.exports = {
  getSdApiId,
  generateSdImage,
};
