process.env.NO_DEPRECATION = 'digest-fetch';

var after = require('after')
var assert = require('assert')
var DigestFetch = require('../')
var factory = require('./test-server')
var chai = require('chai')
var expect = chai.expect
var chaiHttp = require('chai-http')
chai.use(chaiHttp)
chai.should()
var app = factory.getApp()

describe('digest-fetch', function(){

  it('Test Basic Authentication', function() {
    var client = new DigestFetch('test', 'test', { basic: true })
    const auth = client.addBasicAuth().headers.Authorization
    chai.request(app).get('/basic').set('Authorization', auth).then(res => {
      expect(res).to.have.status(200)
    })
  })
  it('Test Basic Authentication with wrong credential', function() {
    var client = new DigestFetch('test', 'test-null', { basic: true })
    const auth = client.addBasicAuth().headers.Authorization
    chai.request(app).get('/basic').set('Authorization', auth).then(res => {
      expect(res).to.have.status(401)
    })
  })
})
