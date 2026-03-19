const net = require('net');

/** Strips port from req.ip for use as a rate-limiter key (IPv4 and IPv6-safe) */
module.exports = (req) => {
  const ip = req?.ip;
  if (!ip) {
    return ip;
  }

  if (net.isIP(ip)) {
    return ip;
  }

  const bracketedIPv6 = ip.match(/^\[(.+)\](:\d+)?$/);
  if (bracketedIPv6) {
    return bracketedIPv6[1];
  }

  const ipv4Port = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (ipv4Port) {
    return ipv4Port[1];
  }

  return ip;
};
