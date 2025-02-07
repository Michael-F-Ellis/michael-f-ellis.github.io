class GitHubCredentials {
	static STORAGE_PREFIX = 'github_pat_';

	static saveCredentials(repoPath, pat) {
		localStorage.setItem(
			this.STORAGE_PREFIX + repoPath,
			pat
		);
	}

	static getCredentials(repoPath) {
		return localStorage.getItem(this.STORAGE_PREFIX + repoPath);
	}

	static getAllRepos() {
		const repos = [];
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key.startsWith(this.STORAGE_PREFIX)) {
				repos.push(key.slice(this.STORAGE_PREFIX.length));
			}
		}
		return repos;
	}
}

function createGitHubDialog() {
	const dialog = document.createElement('dialog');
	const repos = GitHubCredentials.getAllRepos();

	dialog.innerHTML = `
        <h3>Connect to GitHub Repository</h3>
        ${repos.length ? `
            <h4>Saved Repositories:</h4>
            <ul>
                ${repos.map(repo => `
                    <li>
                        <button onclick="connectToRepo('${repo}')">
                            ${repo}
                        </button>
                    </li>
                `).join('')}
            </ul>
            <hr>
        ` : ''}
        <h4>New Repository Connection:</h4>
        <form method="dialog">
            <div>
                <label>Repository Path: <input id="repo-path" type="text" placeholder="username/repo"></label>
            </div>
            <div>
                <label>GitHub PAT: <input id="github-pat" type="password"></label>
            </div>
            <div>
                <label><input type="checkbox" id="save-pat"> Save these credentials</label>
            </div>
            <button type="submit">Connect</button>
            <button type="button" onclick="this.closest('dialog').close()">Cancel</button>
        </form>
    `;

	dialog.querySelector('form').onsubmit = (e) => {
		const path = document.getElementById('repo-path').value;
		const pat = document.getElementById('github-pat').value;
		const save = document.getElementById('save-pat').checked;

		if (save) {
			GitHubCredentials.saveCredentials(path, pat);
		}

		storage = new GitHubStorage(pat);
		navigator = new RepoNavigator(storage, 'score-browser');
		navigator.navigate(path);
	};

	return dialog;
}
export { GitHubCredentials, createGitHubDialog };