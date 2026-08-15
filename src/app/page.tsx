import { getSnapshot } from "@/app/actions";
import { TodoApp } from "@/components/TodoApp";

export const dynamic = "force-dynamic";

export default async function Home() {
  const initial = await getSnapshot();
  return <TodoApp initial={initial} />;
}
