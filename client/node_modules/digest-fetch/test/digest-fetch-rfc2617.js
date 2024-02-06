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
var app = factory.getApp('auth')

describe('digest-fetch', function(){

  it('Test RFC2617', function() {
    var client = new DigestFetch('test', 'test')
    chai.request(app).get('/auth').then(res => {
      expect(res).to.have.status(401)
      client.lastAuth = res.res.headers['www-authenticate']
    })
    .then(() => {
      client.parseAuth(client.lastAuth)
      const auth = client.addAuth('/auth', { method: 'GET' }).headers.Authorization
      chai.request(app).get('/auth').set('Authorization', auth).then(res => {
        expect(res).to.have.status(200)
      })
    })
  })

  it('Test RFC2617 with precomputed hash', function() {
    var client = new DigestFetch('test', DigestFetch.computeHash('test', 'Users', 'test'), { precomputedHash: true })
    chai.request(app).get('/auth').then(res => {
      expect(res).to.have.status(401)
      client.lastAuth = res.res.headers['www-authenticate']
    })
    .then(() => {
      client.parseAuth(client.lastAuth)
      const auth = client.addAuth('/auth', { method: 'GET' }).headers.Authorization
      chai.request(app).get('/auth').set('Authorization', auth).then(res => {
        expect(res).to.have.status(200)
      })
    })
  })

  it('Test RFC2617 with wrong credential', function() {
    var client = new DigestFetch('test', 'test-null')
    chai.request(app).get('/auth').then(res => {
      expect(res).to.have.status(401)
      client.lastAuth = res.res.headers['www-authenticate']
    })
    .then(() => {
      client.parseAuth(client.lastAuth)
      const auth = client.addAuth('/auth', { method: 'GET' }).headers.Authorization
      chai.request(app).get('/auth').set('Authorization', auth).then(res => {
        expect(res).to.have.status(401)
      })
    })
  })
})
