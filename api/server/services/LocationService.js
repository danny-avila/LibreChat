const axios = require('axios');
const { logger } = require('@librechat/data-schemas');

/**
 * Generic fetcher for LGD APIs with pagination
 * @param {string} url - The LGD API URL
 * @param {object} queryParams - Additional query parameters for filtering
 * @returns {Promise<Array>} Array of records
 */
const fetchLgdData = async (url, queryParams = {}) => {
  let allRecords = [];
  let offset = 0;
  const limit = 1000; // Large limit to reduce number of requests

  while (true) {
    try {
      const response = await axios.get(url, {
        params: {
          'api-key': process.env.LGD_API_KEY || process.env.LGD_VILLAGES_API_KEY, // Use generic key env variable
          format: 'json',
          limit,
          offset,
          ...queryParams
        }
      });

      const data = response.data;
      
      // Handle data.gov.in typical response format { records: [...] }
      // Or fallback to an array if the API directly returns it
      let records = [];
      if (data && Array.isArray(data.records)) {
        records = data.records;
      } else if (Array.isArray(data)) {
        records = data;
      } else if (data && data.data && Array.isArray(data.data)) {
        records = data.data;
      } else {
        logger.warn(`[fetchLgdData] Unexpected response format from ${url}`);
      }

      allRecords = allRecords.concat(records);

      if (records.length < limit) {
        break; // Reached the end of the pages
      }
      offset += limit;
    } catch (error) {
      logger.error(`[fetchLgdData] Error fetching from ${url}`, error);
      throw error;
    }
  }

  return allRecords;
};

const getStates = async () => {
  const url = process.env.LGD_STATES_API_URL;
  if (!url) throw new Error('LGD_STATES_API_URL is not defined in environment variables');
  
  const records = await fetchLgdData(url);
  return records.map(record => ({
    code: record.state_code,
    name: record.state_name_english
  }));
};

const getDistricts = async (stateCode) => {
  const url = process.env.LGD_DISTRICTS_API_URL;
  if (!url) throw new Error('LGD_DISTRICTS_API_URL is not defined in environment variables');

  const params = {
    'filters[state_code]': stateCode,
    stateCode // Add direct parameter as fallback
  };
  const records = await fetchLgdData(url, params);
  return records.map(record => ({
    code: record.district_code,
    name: record.district_name_english
  }));
};

const getSubdistricts = async (districtCode) => {
  const url = process.env.LGD_SUBDISTRICTS_API_URL;
  if (!url) throw new Error('LGD_SUBDISTRICTS_API_URL is not defined in environment variables');

  const params = {
    'filters[district_code]': districtCode,
    districtCode // Add direct parameter as fallback
  };
  const records = await fetchLgdData(url, params);
  return records.map(record => ({
    code: record.subdistrict_code,
    name: record.subdistrict_name_english
  }));
};

const getVillages = async (subdistrictCode) => {
  const url = process.env.LGD_VILLAGES_API_URL;
  if (!url) throw new Error('LGD_VILLAGES_API_URL is not defined in environment variables');

  const params = {
    'filters[subdistrict_code]': subdistrictCode,
    'filters[subdistrictCode]': subdistrictCode,
    subdistrictCode // Add direct parameter as fallback
  };
  const records = await fetchLgdData(url, params);
  return records.map(record => ({
    code: record.villageCode,
    name: record.villageNameEnglish
  }));
};

module.exports = {
  getStates,
  getDistricts,
  getSubdistricts,
  getVillages,
};
