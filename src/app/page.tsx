import { redirect } from "next/navigation";

// A raiz não tem marca própria (white label): equipe vai para a área dela.
export default function Home() {
  redirect("/inicio");
}
