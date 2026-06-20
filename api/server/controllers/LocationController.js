const { logger } = require('@librechat/data-schemas');
const { getStates, getDistricts, getSubdistricts, getVillages } = require('~/server/services/LocationService');

const getStatesController = async (req, res) => {
  try {
    const states = await getStates();
    res.status(200).send(states);
  } catch (error) {
    logger.error('Error fetching states:', error);
    res.status(500).send({ message: 'Failed to retrieve states' });
  }
};

const getDistrictsController = async (req, res) => {
  try {
    const { stateCode } = req.query;
    if (!stateCode) {
      return res.status(400).send({ message: 'stateCode query parameter is required' });
    }
    const districts = await getDistricts(stateCode);
    res.status(200).send(districts);
  } catch (error) {
    logger.error('Error fetching districts:', error);
    res.status(500).send({ message: 'Failed to retrieve districts' });
  }
};

const getSubdistrictsController = async (req, res) => {
  try {
    const { districtCode } = req.query;
    if (!districtCode) {
      return res.status(400).send({ message: 'districtCode query parameter is required' });
    }
    const subdistricts = await getSubdistricts(districtCode);
    res.status(200).send(subdistricts);
  } catch (error) {
    logger.error('Error fetching subdistricts:', error);
    res.status(500).send({ message: 'Failed to retrieve subdistricts' });
  }
};

const getVillagesController = async (req, res) => {
  try {
    const { subdistrictCode } = req.query;
    if (!subdistrictCode) {
      return res.status(400).send({ message: 'subdistrictCode query parameter is required' });
    }
    const villages = await getVillages(subdistrictCode);
    res.status(200).send(villages);
  } catch (error) {
    logger.error('Error fetching villages:', error);
    res.status(500).send({ message: 'Failed to retrieve villages' });
  }
};

module.exports = {
  getStatesController,
  getDistrictsController,
  getSubdistrictsController,
  getVillagesController,
};
