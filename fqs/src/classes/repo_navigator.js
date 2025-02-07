class RepoNavigator {
	constructor(storage, containerId) {
		this.storage = storage;
		this.container = document.getElementById(containerId);
		this.currentPath = '';
		this.breadcrumbs = [];
	}

	async navigate(path) {
		this.currentPath = path;
		const items = await this.storage.listDirectory(path);

		// Update breadcrumbs
		this.breadcrumbs = path.split('/').filter(p => p);
		this.render(items);
	}

	render(items) {
		// Clear container
		this.container.innerHTML = '';

		// Render breadcrumbs
		const breadcrumbsDiv = document.createElement('div');
		breadcrumbsDiv.className = 'breadcrumbs';
		this.breadcrumbs.forEach((crumb, index) => {
			const link = document.createElement('a');
			link.textContent = crumb;
			link.href = '#';
			link.onclick = () => {
				const newPath = this.breadcrumbs.slice(0, index + 1).join('/');
				this.navigate(newPath);
			};
			breadcrumbsDiv.appendChild(link);
			if (index < this.breadcrumbs.length - 1) {
				breadcrumbsDiv.appendChild(document.createTextNode(' / '));
			}
		});
		this.container.appendChild(breadcrumbsDiv);

		// Render directory/file list
		const list = document.createElement('div');
		list.className = 'repo-list';

		items.forEach(item => {
			const itemDiv = document.createElement('div');
			itemDiv.className = `repo-item ${item.type}`;

			const icon = document.createElement('span');
			icon.className = 'icon';
			icon.textContent = item.type === 'dir' ? '📁' : '📄';

			const link = document.createElement('a');
			link.textContent = item.name;
			link.href = '#';
			link.onclick = () => {
				if (item.type === 'dir') {
					this.navigate(`${this.currentPath}/${item.name}`);
				} else {
					// Emit file selection event
					this.container.dispatchEvent(new CustomEvent('fileSelect', {
						detail: {
							path: `${this.currentPath}/${item.name}`,
							item: item
						}
					}));
				}
			};

			itemDiv.appendChild(icon);
			itemDiv.appendChild(link);
			list.appendChild(itemDiv);
		});

		this.container.appendChild(list);
	}
}
export { RepoNavigator };
