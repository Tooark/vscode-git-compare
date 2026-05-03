import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { BranchInfo, CommitInfo, DiffHunk, DiffLine, FileDiff, FileStatus } from './types';

/**
 * Serviço para interagir com o Git.
 * Fornece métodos para obter branches, commits, diffs e conteúdo de arquivos.
 */
const execAsync = promisify(exec);

/**
 * Serviço para interagir com o Git.
 * Fornece métodos para obter branches, commits, diffs e conteúdo de arquivos.
 */
export class GitService {
	/**
	 * Construtor do serviço Git.
	 * @param workspaceRoot Caminho para o diretório raiz do workspace (repositório Git)
	 */
	constructor(private workspaceRoot: string) { }

	/**
	 * Executa um comando Git no diretório de trabalho.
	 * @param command Comando a ser executado
	 * @returns Saída do comando
	 */
	private async exec(command: string): Promise<string> {
		try {
			const { stdout } = await execAsync(command, {
				cwd: this.workspaceRoot,
				maxBuffer: 10 * 1024 * 1024 // 10MB para arquivos grandes
			});

			return stdout.trim();
		} catch (error) {
			const err = error as Error & { stderr?: string };
			vscode.window.showErrorMessage(`Git command failed: ${err.stderr || err.message}`);

			throw new Error(err.stderr || err.message);
		}
	}

	/**
	 * Faz parse do output do git diff em hunks estruturados.
	 * 
	 * @param diffOutput Output do comando git diff
	 * @return Lista de hunks de diferença, cada um contendo as linhas alteradas e seus números de linha correspondentes.
	 * @remarks Este método interpreta a saída formatada do comando `git diff` para identificar os blocos de diferença (hunks)
	 * e as linhas dentro desses blocos, classificando cada linha como adição, deleção ou contexto.
	 * @example
	 * ```typescript
	 * const gitService = new GitService('/path/to/workspace');
	 * const diffOutput = await gitService.getDiff('main', 'feature-x', 'src/index.ts');
	 * const hunks = gitService.parseDiffHunks(diffOutput);
	 * console.log(hunks);
	 * // [
	 * //   {
	 * //     oldStart: 10,
	 * //     oldLines: 5,
	 * //     newStart: 10,
	 * //     newLines: 6,
	 * //     changes: [
	 * //       { type: 'context', content: ' linha de código ', oldLineNumber: 10, newLineNumber: 10 },
	 * //       { type: 'delete', content: '-linha removida', oldLineNumber: 11 },
	 * //       { type: 'add', content: '+linha adicionada', newLineNumber: 11 },
	 * //       ...
	 * //     ]
	 * //   },
	 * //	 ...
	 * // ]
	 * ```
	 * @private Este método é privado porque é uma implementação interna para processar a saída do git diff
	 */
	private parseDiffHunks(diffOutput: string): DiffHunk[] {
		const hunks: DiffHunk[] = [];
		const lines = diffOutput.split('\n');

		let currentHunk: DiffHunk | null = null;
		let oldLineNum = 0;
		let newLineNum = 0;

		// Itera sobre cada linha do diff para identificar os hunks e as mudanças dentro deles
		for (const line of lines) {
			// Detecta início de um novo hunk: @@ -1,10 +1,15 @@
			const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);

			// Verifica se a linha atual é o início de um novo hunk
			if (hunkMatch) {
				// Se já estivermos processando um hunk, adicionamos ele à lista antes de iniciar o próximo
				if (currentHunk) {
					hunks.push(currentHunk);
				}

				currentHunk = {
					oldStart: parseInt(hunkMatch[1], 10),
					oldLines: parseInt(hunkMatch[2] || '1', 10),
					newStart: parseInt(hunkMatch[3], 10),
					newLines: parseInt(hunkMatch[4] || '1', 10),
					changes: []
				};

				oldLineNum = currentHunk.oldStart;
				newLineNum = currentHunk.newStart;
				continue;
			}

			// Se estivermos dentro de um hunk, processamos as linhas de mudança
			if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
				const diffLine: DiffLine = {
					type: 'context',
					content: line.substring(1)
				};

				// Classifica a linha como adição, deleção ou contexto e atribui os números de linha correspondentes
				if (line.startsWith('+')) {
					diffLine.type = 'add';
					diffLine.newLineNumber = newLineNum++;
				} else if (line.startsWith('-')) {
					diffLine.type = 'delete';
					diffLine.oldLineNumber = oldLineNum++;
				} else {
					diffLine.type = 'context';
					diffLine.oldLineNumber = oldLineNum++;
					diffLine.newLineNumber = newLineNum++;
				}

				currentHunk.changes.push(diffLine);
			}
		}

		// Adiciona o último hunk processado, se existir
		if (currentHunk) {
			hunks.push(currentHunk);
		}

		return hunks;
	}

	/**
	 * Converte saída formatada de `git log` em lista tipada de commits.
	 * 
	 * @param result Saída do comando `git log` formatada com delimitadores personalizados
	 * @return Lista de objetos CommitInfo contendo hash, mensagem, autor e data de cada commit
	 * @remarks Este método é responsável por interpretar a saída do comando `git log` que foi formatada com
	 * delimitadores personalizados (usando %x1f) para separar os campos. Ele converte essa saída em uma lista
	 * de objetos CommitInfo, que são mais fáceis de manipular no código.
	 * @example
	 * ```typescript
	 * const gitService = new GitService('/path/to/workspace');
	 * const logOutput = await gitService.exec('git log --pretty=format:"%h%x1f%H%x1f%s%x1f%an%x1f%ad" --date=short -n 10');
	 * const commits = gitService.parseCommitList(logOutput);
	 * console.log(commits);
	 * // [
	 * //   { hash: 'abc123', fullHash: 'abc123def456...', message: 'Fix bug', author: 'Alice', date: '2024-06-01' },
	 * //   { hash: 'def456', fullHash: 'def456abc123...', message: 'Add feature', author: 'Bob', date: '2024-05-30' },
	 * //   ...
	 * // ]
	 * ```
	 * @private Este método é privado porque é uma implementação interna para processar a saída do git log
	 */
	private parseCommitList(result: string): CommitInfo[] {
		const lines = result.split('\n').filter(Boolean);

		return lines
			.map(line => line.split('\x1f'))
			.filter(parts => parts.length >= 5)
			.map(([hash, fullHash, message, author, date]) => ({
				hash,
				fullHash,
				message,
				author,
				date
			}));
	}

	/**
	 * Verifica se o diretório atual é um repositório Git.
	 * 
	 * @returns `true` se for um repositório Git, `false` caso contrário.
	 * @throws Erro se o comando Git falhar por algum motivo (ex: Git não instalado).
	 * @remarks Este método tenta executar um comando Git simples para verificar a presença
	 * de um repositório. Se o comando falhar, assume-se que não é um repositório Git.
	 * @example
	 * ```typescript
	 * const gitService = new GitService('/path/to/workspace');
	 * const isRepo = await gitService.isGitRepository();
	 * console.log(isRepo); // true ou false
	 * ```
	 */
	async isGitRepository(): Promise<boolean> {
		try {
			await this.exec('git rev-parse --git-dir');
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Obtém a lista de branches locais e remotos.
	 * 
	 * @returns Lista de branches com informações sobre cada branch
	 * @remarks Este método executa um comando Git para listar todos os branches, tanto locais quanto remotos.
	 * Ele formata a saída para extrair o nome do branch, se é o branch atual e se é um branch remoto.
	 * @example
	 * ```typescript
	 * const gitService = new GitService('/path/to/workspace');
	 * const branches = await gitService.getBranches();
	 * console.log(branches);
	 * // [
	 * //   { name: 'main', isCurrent: true, isRemote: false },
	 * //   { name: 'feature-x', isCurrent: false, isRemote: false },
	 * //   { name: 'origin/main', isCurrent: false, isRemote: true }
	 * // ]
	 * ```
	 */
	async getBranches(): Promise<BranchInfo[]> {
		const result = await this.exec('git branch -a --format="%(refname:short)|%(HEAD)|%(refname)"');
		const lines = result.split('\n').filter(Boolean);

		return lines.map(line => {
			const [name, isCurrent, refname] = line.split('|');
			return {
				name: name.trim(),
				isCurrent: isCurrent.trim() === '*',
				isRemote: refname.includes('refs/remotes/')
			};
		});
	}

	/**
	 * Obtém a lista de commits recentes.
	 * 
	 * @param limit Número máximo de commits a retornar (padrão: 50)
	 * @return Lista de commits com informações sobre cada commit
	 * @remarks Este método executa um comando Git para listar os commits recentes, formatando a saída para extrair o hash curto, hash completo, mensagem, autor e data de cada commit.
	 * @example
	 * ```typescript
	 * const gitService = new GitService('/path/to/workspace');
	 * const commits = await gitService.getCommits(10);
	 * console.log(commits);
	 * // [
	 * //   { hash: 'abc123', fullHash: 'abc123def456...', message: 'Fix bug', author: 'Alice', date: '2024-06-01' },
	 * //   { hash: 'def456', fullHash: 'def456abc123...', message: 'Add feature', author: 'Bob', date: '2024-05-30' },
	 * //   ...
	 * // ]
	 * ```
	 */
	async getCommits(limit: number = 50): Promise<CommitInfo[]> {
		const format = '%h%x1f%H%x1f%s%x1f%an%x1f%ad';
		const result = await this.exec(`git log --pretty=format:"${format}" --date=short -n ${limit}`);

		return this.parseCommitList(result);
	}

	/**
	 * Obtém a lista de commits de uma referência específica (branch/tag/commit).
	 * 
	 * @param ref Referência para filtrar o histórico
	 * @param limit Número máximo de commits a retornar
	 * @return Lista de commits relacionados à referência fornecida
	 * @remarks Este método é similar ao `getCommits`, mas permite filtrar os commits por uma referência específica, como um branch ou tag. Ele formata a saída do comando Git para extrair as informações dos commits.
	 * @example
	 * ```typescript
	 * const gitService = new GitService('/path/to/workspace');
	 * const commits = await gitService.getCommitsForRef('main', 10);
	 * console.log(commits);
	 * // [
	 * //   { hash: 'abc123', fullHash: 'abc123def456...', message: 'Fix bug', author: 'Alice', date: '2024-06-01' },
	 * //   { hash: 'def456', fullHash: 'def456abc123...', message: 'Add feature', author: 'Bob', date: '2024-05-30' },
	 * //   ...
	 * // ]
	 * ```
	 */
	async getCommitsForRef(ref: string, limit: number = 20): Promise<CommitInfo[]> {
		const format = '%h%x1f%H%x1f%s%x1f%an%x1f%ad';
		const result = await this.exec(`git log ${ref} --pretty=format:"${format}" --date=short -n ${limit}`);

		return this.parseCommitList(result);
	}

	/**
	 * Obtém a lista de arquivos alterados entre dois commits/branches.
	 * 
	 * @param ref1 Primeira referência (commit ou branch)
	 * @param ref2 Segunda referência (commit ou branch)
	 * @return Lista de arquivos com status de alteração (adicionado, modificado, deletado, renomeado)
	 * @remarks Este método executa um comando Git para listar os arquivos que foram alterados entre duas referências, como branches ou commits. Ele interpreta a saída para determinar o status de cada arquivo (adicionado, modificado, deletado ou renomeado).
	 * @example
	 * ```typescript
	 * const gitService = new GitService('/path/to/workspace');
	 * const changedFiles = await gitService.getChangedFiles('main', 'feature-x');
	 * console.log(changedFiles);
	 * // [
	 * //   { file: 'src/index.ts', status: 'modified' },
	 * //   { file: 'src/new-file.ts', status: 'added' },
	 * //   { file: 'src/old-file.ts', status: 'deleted' },
	 * //   { file: 'src/renamed-file.ts', status: 'renamed' }
	 * // ]
	 * ```
	 */
	async getChangedFiles(ref1: string, ref2: string): Promise<{ file: string; status: FileStatus }[]> {
		const result = await this.exec(`git diff --name-status ${ref1}..${ref2}`);
		const lines = result.split('\n').filter(Boolean);

		return lines.map(line => {
			const [statusCode, ...fileParts] = line.split('\t');
			const file = fileParts.join('\t'); // Para arquivos renomeados: R100\told\tnew

			let status: FileStatus;
			switch (statusCode[0]) {
				case 'A': status = 'added'; break;
				case 'D': status = 'deleted'; break;
				case 'R': status = 'renamed'; break;
				default: status = 'modified';
			}

			return { file, status };
		});
	}

	/**
	 * Obtém o conteúdo de um arquivo em um commit/branch específico.
	 * 
	 * @param ref Referência (commit ou branch)
	 * @param filePath Caminho do arquivo
	 * @return Conteúdo do arquivo na referência especificada. Retorna uma string vazia se o arquivo não existir nessa referência.
	 * @throws Caso o comando Git falhe por algum motivo retorna uma string vazia.
	 * @remarks Este método executa um comando Git para obter o conteúdo de um arquivo em uma referência específica,
	 * como um commit ou branch. Se o arquivo não existir nessa referência (por exemplo, se foi adicionado depois
	 * ou deletado antes), ele retorna uma string vazia.
	 * @example
	 * ```typescript
	 * const gitService = new GitService('/path/to/workspace');
	 * const content = await gitService.getFileContent('main', 'src/index.ts');
	 * console.log(content);
	 * // Conteúdo do arquivo src/index.ts na branch main
	 * ```
	 */
	async getFileContent(ref: string, filePath: string): Promise<string> {
		try {
			return await this.exec(`git show "${ref}":"${filePath}"`);
		} catch {
			return ''; // Arquivo não existe nesta referência
		}
	}

	/**
	 * Obtém o diff formatado entre dois commits/branches.
	 * 
	 * @param ref1 Primeira referência
	 * @param ref2 Segunda referência
	 * @param file Arquivo específico (opcional)
	 * @return Diferenças formatadas no estilo do comando `git diff`. Se um arquivo específico for fornecido,
	 * retorna apenas as diferenças para esse arquivo.
	 * @remarks Este método executa um comando Git para obter as diferenças formatadas entre duas referências,
	 * como branches ou commits. Se um arquivo específico for fornecido, ele retorna apenas as diferenças para esse arquivo.
	 * @example
	 * ```typescript
	 * const gitService = new GitService('/path/to/workspace');
	 * const diff = await gitService.getDiff('main', 'feature-x', 'src/index.ts');
	 * console.log(diff);
	 * // Diferenças formatadas para src/index.ts entre main e feature-x
	 * ```
	 * @example
	 * ```typescript
	 * const gitService = new GitService('/path/to/workspace');
	 * const diff = await gitService.getDiff('main', 'feature-x');
	 * console.log(diff);
	 * // Diferenças formatadas para todos os arquivos entre main e feature-x
	 * ```
	 */
	async getDiff(ref1: string, ref2: string, file?: string): Promise<string> {
		const fileArg = file ? ` -- "${file}"` : '';

		return this.exec(`git diff ${ref1}..${ref2}${fileArg}`);
	}

	/**
	 * Obtém as diferenças detalhadas de um arquivo entre dois commits.
	 * 
	 * @param ref1 Primeira referência
	 * @param ref2 Segunda referência
	 * @param filePath Caminho do arquivo
	 * @return Objeto FileDiff contendo o nome do arquivo, status de alteração, conteúdo antigo,
	 * conteúdo novo e os hunks de diferença.
	 * @remarks Este método combina a obtenção do conteúdo antigo e novo do arquivo com o diff
	 * formatado para construir um objeto FileDiff detalhado, que inclui o status de alteração
	 * (adicionado, modificado, deletado, renomeado) e os hunks de diferença estruturados.
	 * @example
	 * ```typescript
	 * const gitService = new GitService('/path/to/workspace');
	 * const fileDiff = await gitService.getFileDiff('main', 'feature-x', 'src/index.ts');
	 * console.log(fileDiff);
	 * // {
	 * //   fileName: 'src/index.ts',
	 * //   status: 'modified',
	 * //   oldContent: 'conteúdo antigo...',
	 * //   newContent: 'conteúdo novo...',
	 * //   hunks: [ ... ]
	 * // }
	 * ```
	 */
	async getFileDiff(ref1: string, ref2: string, filePath: string): Promise<FileDiff> {
		const [oldContent, newContent, diffOutput, statusResult] = await Promise.all([
			this.getFileContent(ref1, filePath),
			this.getFileContent(ref2, filePath),
			this.getDiff(ref1, ref2, filePath),
			this.exec(`git diff --name-status ${ref1}..${ref2} -- "${filePath}"`)
		]);

		// Determinar status
		let status: FileStatus = 'modified';
		if (statusResult) {
			const statusCode = statusResult[0];
			switch (statusCode) {
				case 'A': status = 'added'; break;
				case 'D': status = 'deleted'; break;
				case 'R': status = 'renamed'; break;
			}
		}

		// Parse dos hunks
		const hunks = this.parseDiffHunks(diffOutput);

		return {
			fileName: filePath,
			status,
			oldContent,
			newContent,
			hunks
		};
	}

	/**
	 * Obtém estatísticas de um diff entre dois commits.
	 * 
	 * @param ref1 Primeira referência
	 * @param ref2 Segunda referência
	 * @return Objeto contendo o número total de arquivos alterados, adições e deleções entre as duas referências.
	 * @remarks Este método executa o comando `git diff --stat` para obter um resumo das alterações entre duas
	 * referências, como branches ou commits. Ele interpreta a última linha da saída para extrair o número total
	 * de arquivos alterados, adições e deleções.
	 * @example
	 * ```typescript
	 * const gitService = new GitService('/path/to/workspace');
	 * const stats = await gitService.getDiffStats('main', 'feature-x');
	 * console.log(stats);
	 * // {
	 * //   files: 5,
	 * //   additions: 100,
	 * //   deletions: 50
	 * // }
	 * ```
	 */
	async getDiffStats(ref1: string, ref2: string): Promise<{ additions: number; deletions: number; files: number }> {
		const result = await this.exec(`git diff --stat ${ref1}..${ref2}`);
		const lastLine = result.split('\n').pop() || '';

		// Parse: " 5 files changed, 100 insertions(+), 50 deletions(-)"
		const filesMatch = lastLine.match(/(\d+) files? changed/);
		const addMatch = lastLine.match(/(\d+) insertions?\(\+\)/);
		const delMatch = lastLine.match(/(\d+) deletions?\(-\)/);

		return {
			files: filesMatch ? parseInt(filesMatch[1], 10) : 0,
			additions: addMatch ? parseInt(addMatch[1], 10) : 0,
			deletions: delMatch ? parseInt(delMatch[1], 10) : 0
		};
	}

	/**
	 * Obtém o nome do branch atual.
	 * 
	 * @return Nome do branch atual. Retorna uma string vazia se não estiver em um branch (ex: detached HEAD).
	 * @remarks Este método executa o comando `git branch --show-current` para obter o nome do branch atual.
	 * Se o repositório estiver em um estado de detached HEAD, ele retornará uma string vazia.
	 * @example
	 * ```typescript
	 * const gitService = new GitService('/path/to/workspace');
	 * const currentBranch = await gitService.getCurrentBranch();
	 * console.log(currentBranch); // 'main' ou '' se detached HEAD
	 * ```
	 */
	async getCurrentBranch(): Promise<string> {
		return this.exec('git branch --show-current');
	}

	/**
	 * Obtém todas as referências disponíveis (branches + tags + commits recentes).
	 * 
	 * @return Lista de referências, incluindo branches locais, remotos, tags e commits recentes.
	 * As referências são retornadas em ordem de prioridade: branches locais, branches remotos, tags e commits.
	 * @remarks Este método combina a obtenção de branches locais e remotos, tags e commits recentes para fornecer
	 * uma lista abrangente de referências disponíveis no repositório. Ele remove duplicatas mantendo a ordem de prioridade.
	 * @example
	 * ```typescript
	 * const gitService = new GitService('/path/to/workspace');
	 * const refs = await gitService.getAllRefs();
	 * console.log(refs);
	 * // [
	 * //   'main',
	 * //   'feature-x',
	 * //   'origin/main',
	 * //   'v1.0.0',
	 * //   'abc123',
	 * //   ...
	 * // ]
	 * ```
	 */
	async getAllRefs(): Promise<string[]> {
		const [branches, tags, commits] = await Promise.all([
			this.exec('git for-each-ref --format="%(refname:short)" refs/heads/ refs/remotes/').catch(() => ''),
			this.exec('git tag').catch(() => ''),
			this.exec('git log --pretty=format:"%h" -n 20').catch(() => '')
		]);

		const allRefs = [
			...branches.split('\n').filter(Boolean),
			...tags.split('\n').filter(Boolean),
			...commits.split('\n').filter(Boolean)
		];

		// Remove duplicatas mantendo a ordem
		return [...new Set(allRefs)];
	}
}
