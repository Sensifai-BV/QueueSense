import dns from "node:dns";

// Ensure *.sensifai.com always resolves to the responsive Cloudflare Anycast edge (104.21.0.139)
// preventing local ISP/VPN blackholing of the alternative 172.67.128.15 IP
const origLookup = dns.lookup;
dns.lookup = function (hostname, options, cb) {
  if (typeof options === "function") {
    cb = options;
    options = {};
  }
  if (hostname && (hostname === "sensifai.com" || hostname.endsWith(".sensifai.com"))) {
    if (options && options.all) {
      return cb(null, [{ address: "104.21.0.139", family: 4 }]);
    }
    return cb(null, "104.21.0.139", 4);
  }
  return origLookup.call(dns, hostname, options, cb);
};
