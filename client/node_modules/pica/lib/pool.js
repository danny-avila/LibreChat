'use strict';


const GC_INTERVAL = 100;


function Pool(create, idle) {
  this.create = create;

  this.available = [];
  this.acquired = {};
  this.lastId = 1;

  this.timeoutId = 0;
  this.idle = idle || 2000;
}


Pool.prototype.acquire = function () {
  let resource;

  if (this.available.length !== 0) {
    resource = this.available.pop();
  } else {
    resource = this.create();
    resource.id = this.lastId++;
    resource.release = () => this.release(resource);
  }
  this.acquired[resource.id] = resource;
  return resource;
};


Pool.prototype.release = function (resource) {
  delete this.acquired[resource.id];

  resource.lastUsed = Date.now();
  this.available.push(resource);

  if (this.timeoutId === 0) {
    this.timeoutId = setTimeout(() => this.gc(), GC_INTERVAL);
  }
};


Pool.prototype.gc = function () {
  const now = Date.now();

  this.available = this.available.filter(resource => {
    if (now - resource.lastUsed > this.idle) {
      resource.destroy();
      return false;
    }
    return true;
  });

  if (this.available.length !== 0) {
    this.timeoutId = setTimeout(() => this.gc(), GC_INTERVAL);
  } else {
    this.timeoutId = 0;
  }
};


module.exports = Pool;
