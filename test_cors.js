import http from "http";
import https from "https";

const req = https.request("https://hldvxfurkstqhmmktxsz.supabase.co/rest/v1/flights", {
  method: "OPTIONS",
  headers: {
    "Origin": "https://ais-dev-lhqrb3bbxhmzqu4ndjfsus-10197488960.europe-west2.run.app",
    "Access-Control-Request-Method": "GET"
  }
}, (res) => {
  console.log(res.statusCode);
  console.log(res.headers);
});
req.end();
