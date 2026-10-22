
import { supabase } from "../lib/supabase";

async function testSupabase() {
  const { error } = await supabase
    .from("members")
    .select("id")
    .limit(1);

  if (error) {
    console.error("Erreur Supabase :", error.message);
    return;
  }

  console.log("Connexion Supabase réussie !");
}

testSupabase();
