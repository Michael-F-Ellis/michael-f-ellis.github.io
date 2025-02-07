class GitHubStorage {
	constructor(pat) {
		this.pat = pat;
		this.baseUrl = 'https://api.github.com';
	}

	async uploadFile(content, repoPath, message = 'Update file') {
		const [owner, repo, ...pathParts] = repoPath.split('/');
		const path = pathParts.join('/');

		// First check if file exists to get SHA
		let existingSha;
		try {
			const existing = await this.getFile(repoPath);
			existingSha = existing.sha;
		} catch (e) {
			// File doesn't exist yet
		}

		const endpoint = `${this.baseUrl}/repos/${owner}/${repo}/contents/${path}`;
		const body = {
			message,
			content: btoa(content),
			...(existingSha && { sha: existingSha })
		};

		const response = await fetch(endpoint, {
			method: 'PUT',
			headers: {
				'Authorization': `Bearer ${this.pat}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			throw new Error(`GitHub API error: ${response.statusText}`);
		}

		return response.json();
	}

	async getFile(repoPath) {
		const [owner, repo, ...pathParts] = repoPath.split('/');
		const path = pathParts.join('/');

		const endpoint = `${this.baseUrl}/repos/${owner}/${repo}/contents/${path}`;
		const response = await fetch(endpoint, {
			headers: {
				'Authorization': `Bearer ${this.pat}`
			}
		});

		if (!response.ok) {
			throw new Error(`GitHub API error: ${response.statusText}`);
		}

		const data = await response.json();
		return {
			content: atob(data.content),
			sha: data.sha
		};
	}
	async listDirectory(repoPath) {
		const [owner, repo, ...pathParts] = repoPath.split('/');
		const path = pathParts.join('/');

		const endpoint = `${this.baseUrl}/repos/${owner}/${repo}/contents/${path}`;
		const response = await fetch(endpoint, {
			headers: {
				'Authorization': `Bearer ${this.pat}`
			}
		});

		if (!response.ok) {
			throw new Error(`GitHub API error: ${response.statusText}`);
		}

		const items = await response.json();
		return items.map(item => ({
			name: item.name,
			path: item.path,
			type: item.type, // 'file' or 'dir'
			size: item.size,
			sha: item.sha,
			url: item.download_url
		}));
	}

	async searchFiles(repoPath, pattern) {
		const [owner, repo] = repoPath.split('/');
		const endpoint = `${this.baseUrl}/search/code?q=repo:${owner}/${repo}+${pattern}`;

		const response = await fetch(endpoint, {
			headers: {
				'Authorization': `Bearer ${this.pat}`,
				'Accept': 'application/vnd.github.v3+json'
			}
		});

		if (!response.ok) {
			throw new Error(`GitHub API error: ${response.statusText}`);
		}

		const data = await response.json();
		return data.items.map(item => ({
			name: item.name,
			path: item.path,
			sha: item.sha,
			url: item.html_url
		}));
	}
}

export { GitHubStorage };
