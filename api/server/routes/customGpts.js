const express = require('express');
const router = express.Router();
const { getCustomGpts, updateCustomGpt, deleteCustomGpts } = require('../../models');

router.get('/', async (req, res) => {
  const models = (await getCustomGpts()).map(model => {
    model = model.toObject();
    model._id = model._id.toString();
    return model;
  });
  // console.log(models);
  res.status(200).send(models);
});

router.post('/delete/:_id', async (req, res) => {
  const { _id } = req.params;
  let filter = {};

  if (_id) {
    filter = { _id };
  }

  try {
    const dbResponse = await deleteCustomGpts(filter);
    res.status(201).send(dbResponse);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

// router.post('/create', async (req, res) => {
//   const payload = req.body.arg;

//   try {
//     const dbResponse = await createCustomGpt(payload);
//     res.status(201).send(dbResponse);
//   } catch (error) {
//     console.error(error);
//     res.status(500).send(error);
//   }
// });

router.post('/', async (req, res) => {
  const update = req.body.arg;

  try {
    const dbResponse = await updateCustomGpt(update);
    res.status(201).send(dbResponse);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

module.exports = router;
