// api/test/__mocks__/openid-client-passport.js
const Strategy = jest.fn().mockImplementation((options, verify) => {
  return { name: 'mocked-openid-passport-strategy', options, verify };
});

module.exports = { Strategy };
