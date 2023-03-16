const express = require('express');
const router = express.Router();
const {
  getCustomGpts,
  updateCustomGpt,
  updateByLabel,
  deleteCustomGpts
} = require('../../models');

router.get('/', async (req, res) => {
  const models = (await getCustomGpts(req?.session?.user?.username)).map((model) => {
    model = model.toObject();
    model._id = model._id.toString();
    return model;
  });
  res.status(200).send(models);
});

router.post('/delete', async (req, res) => {
  const { arg } = req.body;

  try {
    await deleteCustomGpts(req?.session?.user?.username, arg);
    const models = (await getCustomGpts(req?.session?.user?.username)).map((model) => {
      model = model.toObject();
      model._id = model._id.toString();
      return model;
    });
    res.status(201).send(models);
    // res.status(201).send(dbResponse);
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

  let setter = updateCustomGpt;

  if (update.prevLabel) {
    setter = updateByLabel;
  }

  try {
    const dbResponse = await setter(req?.session?.user?.username, update);
    res.status(201).send(dbResponse);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

module.exports = router;
