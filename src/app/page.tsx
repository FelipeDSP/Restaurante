import { redirect } from "next/navigation";

// A raiz não tem marca própria (white label): equipe vai para o login.
export default function Home() {
  redirect("/login");
}
