import { useCallback, useEffect, useState } from "react";

interface TaskItem {
	id: number;
	title: string;
	done: boolean;
}

const API = {
	async list(): Promise<TaskItem[]> {
		return [
			{ id: 1, title: "Seed task A", done: false },
			{ id: 2, title: "Seed task B", done: true },
		];
	},
};

export function App() {
	const [tasks, setTasks] = useState<TaskItem[]>([]);
	const [title, setTitle] = useState("");

	useEffect(() => {
		API.list().then((fresh) =>
			setTasks((prev) => [
				...fresh,
				...prev.filter((p) => !fresh.some((f) => f.id === p.id)),
			]),
		);
	}, []);

	const add = useCallback(() => {
		if (!title.trim()) return;
		const next: TaskItem = { id: Date.now(), title, done: false };
		setTasks((prev) => [...prev, next]);
		setTitle("");
	}, [title]);

	const reload = useCallback(() => {
		API.list().then((fresh) =>
			setTasks((prev) => [
				...fresh,
				...prev.filter((p) => !fresh.some((f) => f.id === p.id)),
			]),
		);
	}, []);

	return (
		<main>
			<h1>Tasks</h1>
			<div>
				<input
					data-testid="title"
					value={title}
					onChange={(e) => setTitle(e.target.value)}
				/>
				<button data-testid="add" onClick={add}>
					Add
				</button>
				<button data-testid="reload" onClick={reload}>
					Reload
				</button>
			</div>
			<ul>
				{tasks.map((t) => (
					<li key={t.id} data-testid={`task-${t.id}`}>
						{t.title}
					</li>
				))}
			</ul>
		</main>
	);
}