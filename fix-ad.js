import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://hldvxfurkstqhmmktxsz.supabase.co",
  "sb_publishable_E9StxaACROyElt3UQ8qVYw_C0zsUQzy"
);

async function check() {
  const { data, error } = await supabase.from("incoming_duties").select("*");
  if (error) {
    console.error(error);
    return;
  }
  console.log(data);
}

check();
