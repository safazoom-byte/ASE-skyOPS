const url = "https://hldvxfurkstqhmmktxsz.supabase.co/rest/v1/flights";
fetch(url, { headers: { apikey: "sb_publishable_E9StxaACROyElt3UQ8qVYw_C0zsUQzy" } })
  .then(res => res.text().then(text => console.log(res.status, text)))
  .catch(err => console.log(err.message));
