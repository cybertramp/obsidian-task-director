import {
	App,
	Plugin,
	TFile,
	Notice,
	Setting,
	PluginSettingTab,
	Modal,
} from "obsidian";

interface BatchTaskTogglePluginSettings {
	removeCompletedDate: boolean;
}

const DEFAULT_SETTINGS: BatchTaskTogglePluginSettings = {
	removeCompletedDate: true,
};

export default class BatchTaskTogglePlugin extends Plugin {
	settings: BatchTaskTogglePluginSettings;

	async onload() {
		await this.loadSettings();
		console.log("Batch Task Toggle plugin loaded");

		// add setting UI
		this.addSettingTab(
			new BatchTaskTogglePluginSettingsTab(this.app, this)
		);

		// add command
		this.addCommand({
			id: "change-to-done",
			name: "Change tasks to done",
			callback: () => this.toggleTasksInCurrentFile(true),
		});

		// add command
		this.addCommand({
			id: "change-to-not-done",
			name: "Change tasks to todo",
			callback: () => this.toggleTasksInCurrentFile(false),
		});

		// add command
		this.addCommand({
			id: "show-todo-summary",
			name: "Show page todo summary",
			callback: () => this.showTodoCountsInCurrentFile(),
		});

		// add right click menu command
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFile && file.extension === "md") {
					// Feature: Incomplete -> Complete
					menu.addItem((item) => {
						item.setTitle("Todo -> Done")
							.setIcon("list-checks")
							.onClick(() => this.toggleTasksInFile(file, true));
					});

					// Feature: Change Complete -> Incomplete
					menu.addItem((item) => {
						item.setTitle("Done -> Todo")
							.setIcon("layout-list")
							.onClick(() => this.toggleTasksInFile(file, false));
					});

					// Feature: Count todo
					menu.addItem((item) => {
						item.setTitle("Todo summary")
							.setIcon("info")
							.onClick(() => this.showTodoCounts(file));
					});
				}
			})
		);
	}

	async toggleTasksInFile(file: TFile, toComplete: boolean) {
		const content = await this.app.vault.read(file);

		let count = 0;
		let updatedContent = content;

		if (toComplete) {
			// Incomplete -> Complete
			updatedContent = content.replace(/- \[ \]/g, () => {
				count++;
				return "- [x]";
			});
		} else {
			// Complete -> Incomplete
			if (this.settings.removeCompletedDate) {
				updatedContent = this.removeCompletedDate(content);
				count = (content.match(/- \[x\]/g) || []).length;
			} else {
				updatedContent = content.replace(/- \[x\]/g, () => {
					count++;
					return "- [ ]";
				});
			}
		}

		if (content !== updatedContent) {
			await this.app.vault.modify(file, updatedContent);
			const status = toComplete ? "completed" : "incomplete";
			new Notice(
				`All tasks in "${file.name}" marked as ${status}! Total tasks changed: ${count}.`
			);
		} else {
			new Notice(`No tasks to update in "${file.name}".`);
		}
	}

	async toggleTasksInCurrentFile(toComplete: boolean) {

		const activeFile = this.app.workspace.getActiveFile();

		if (!activeFile) {
			new Notice("No file is currently active");
			return;
		}

		this.toggleTasksInFile(activeFile, toComplete);

	}

	private removeCompletedDate(content: string): string {
		// First, replace "- [x]" with "- [ ]"
		let updatedContent = content.replace(/- \[x\]/g, "- [ ]");

		// Then, remove any "✅ YYYY-MM-DD" preceded by whitespace
		updatedContent = updatedContent.replace(/ ?✅ \d{4}-\d{2}-\d{2}/g, "");

		return updatedContent;
	}

	async showTodoCounts(file: TFile) {
		const content = await this.app.vault.read(file);

		// Count TODO with regex
		const totalTodos = (content.match(/- \[ \] |- \[x\] /g) || []).length;
		const incompleteTodos = (content.match(/- \[ \] /g) || []).length;
		const completeTodos = (content.match(/- \[x\] /g) || []).length;

		// Show Modal instead of Notice
		new TodoCountsModal(
			this.app,
			file,
			totalTodos,
			incompleteTodos,
			completeTodos
		).open();
	}

	async showTodoCountsInCurrentFile() {
		const activeFile = this.app.workspace.getActiveFile();

		if (!activeFile) {
			new Notice("No file is currently active");
			return;
		}

		const content = await this.app.vault.read(activeFile);

		// Count TODO with regex
		const totalTodos = (content.match(/- \[ \] |- \[x\] /g) || []).length;
		const incompleteTodos = (content.match(/- \[ \] /g) || []).length;
		const completeTodos = (content.match(/- \[x\] /g) || []).length;

		// Show Modal instead of Notice
		new TodoCountsModal(
			this.app,
			activeFile,
			totalTodos,
			incompleteTodos,
			completeTodos
		).open();
	}

	async markAllTasksInCurrentFile(markAsDone: boolean) {
		// get current active file
		const activeFile = this.app.workspace.getActiveFile();

		if (!activeFile) {
			new Notice("No file is currently active");
			return;
		}

		const content = await this.app.vault.read(activeFile);
		let count = 0;
		let updatedContent = content;

		if (markAsDone) {
			// todo -> done
			count = (content.match(/- \[ \] /g) || []).length;
			updatedContent = content.replace(/- \[ \] /g, "- [x] ");
		} else {
			// done -> todo
			if (this.settings.removeCompletedDate) {
				// if exist tasks plugin date
				const lines = content.split("\n");
				const processedLines = lines.map((line) => {
					if (line.includes("- [x]")) {
						return line
							.replace(/- \[x\](.*?)\s+✅.*$/, "- [ ] $1")
							.trim();
					}
					return line;
				});
				updatedContent = processedLines.join("\n");
				count = (content.match(/- \[x\] /g) || []).length;
			} else {
				// change status
				count = (content.match(/- \[x\] /g) || []).length;
				updatedContent = content.replace(/- \[x\] /g, "- [ ] ");
			}
		}

		if (content !== updatedContent) {
			await this.app.vault.modify(activeFile, updatedContent);
			const status = markAsDone ? "done" : "not done";
			new Notice(
				`All tasks in "${activeFile.name}" marked as ${status}! Total tasks changed: ${count}`
			);
		} else {
			new Notice(`No tasks to update in "${activeFile.name}"`);
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	onunload() {
		console.log("Batch Task Toggle plugin unloaded");
	}
}

class BatchTaskTogglePluginSettingsTab extends PluginSettingTab {
	plugin: BatchTaskTogglePlugin;

	constructor(app: App, plugin: BatchTaskTogglePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Remove completed date")
			.setDesc(
				"Remove the date(for Task plugin: ✅ 2024-11-04) from completed tasks when toggled. "
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.removeCompletedDate)
					.onChange(async (value) => {
						this.plugin.settings.removeCompletedDate = value;
						await this.plugin.saveSettings();
					})
			);
	}
}

class TodoCountsModal extends Modal {
	private file: TFile;
	private totalTodos: number;
	private incompleteTodos: number;
	private completeTodos: number;

	constructor(
		app: App,
		file: TFile,
		totalTodos: number,
		incompleteTodos: number,
		completeTodos: number
	) {
		super(app);
		this.file = file;
		this.totalTodos = totalTodos;
		this.incompleteTodos = incompleteTodos;
		this.completeTodos = completeTodos;
	}

	onOpen() {
		const { contentEl } = this;

		// add title
		contentEl.createEl("h2", { text: "Page task statistics" });

		// file name
		contentEl.createEl("p", {
			text: `File: ${this.file.name}`,
			cls: "todo-stats-filename",
		});

		// add table
		const table = contentEl.createEl("table", { cls: "todo-stats-table" });

		// add modal class
		contentEl.addClass("todo-stats-modal");

		// add data in table
		this.addTableRow(table, "Total tasks", this.totalTodos);
		this.addTableRow(table, "Completed", this.completeTodos);
		this.addTableRow(table, "Incomplete", this.incompleteTodos);

		// percentage
		const completionRate =
			this.totalTodos > 0
				? ((this.completeTodos / this.totalTodos) * 100).toFixed(1)
				: 0;

		contentEl.createEl("p", {
			text: `Completion rate: ${completionRate}%`,
			cls: "completion-rate",
		});
	}

	private addTableRow(table: HTMLTableElement, label: string, value: number) {
		const row = table.createEl("tr");
		row.createEl("td", { text: label });
		row.createEl("td", { text: value.toString() });
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}