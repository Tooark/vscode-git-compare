import * as Diff from 'diff';
import { GitService } from './gitService';
import { t } from './i18n';
import { escapeHtml } from './utils';

/**
 * Classe que representa as informações de comparação entre dois hashes (branches ou commits) para um arquivo específico.
 * Contém o nome do arquivo, status da comparação, nomes dos hashes comparados, conteúdos dos arquivos e as linhas de diferença.
 */
export class HashInfo {
	file: string;
	status: string;
	hash1_name: string;
	hash2_name: string;
	hash1_content: string;
	hash2_content: string;
	diffLines: Diff.Change[];

	constructor(
		file: string,
		status: string,
		hash1_name: string,
		hash2_name: string,
		hash1_content: string,
		hash2_content: string,
		diffLines: Diff.Change[] = []
	) {
		this.file = file;
		this.status = status;
		this.hash1_name = hash1_name;
		this.hash2_name = hash2_name;
		this.hash1_content = hash1_content;
		this.hash2_content = hash2_content;
		this.diffLines = diffLines;
	}
}

/**
 * Constrói o HTML para uma linha de diferença, destacando as partes adicionadas e removidas.
 * 
 * @param oldLine A linha original (removida).
 * @param newLine A linha modificada (adicionada).
 * @returns Um objeto contendo o HTML para a linha antiga (com partes removidas destacadas) e a linha nova (com partes adicionadas destacadas).
 */
function buildInlineChangedPair(oldLine: string, newLine: string): { left: string; right: string } {
	const parts = Diff.diffWordsWithSpace(oldLine, newLine);
	let left = '';
	let right = '';

	// Itera sobre as partes da diferença
	for (const part of parts) {
		const escaped = escapeHtml(part.value);

		// Se a parte foi adicionada, destaca na linha direita; se foi removida, destaca na linha esquerda; caso contrário, mantém o texto normal em ambas as linhas
		if (part.added) {
			right += `<span class="inline-added">${escaped}</span>`;
		} else if (part.removed) {
			left += `<span class="inline-removed">${escaped}</span>`;
		} else {
			left += escaped;
			right += escaped;
		}
	}

	return { left, right };
}

/**
 * Constrói o HTML para a comparação lado a lado entre dois conteúdos de arquivo, utilizando as linhas de diferença para destacar as mudanças.
 * 
 * @param compare O objeto HashInfo contendo os conteúdos dos arquivos e as linhas de diferença.
 * @returns Um objeto contendo o HTML para as linhas do arquivo antigo (hash1) e do arquivo novo (hash2), com as diferenças destacadas.
 */
export function buildSideBySideDiff(compare: HashInfo): { leftLines: string; rightLines: string } {
	// Se não houver diferenças, retorna os conteúdos originais escapados como HTML
	if (!compare.diffLines || compare.diffLines.length === 0) {
		return {
			leftLines: escapeHtml(compare.hash1_content),
			rightLines: escapeHtml(compare.hash2_content)
		};
	}

	const changes: Array<{ type: 'context' | 'added' | 'removed'; lines: string[] }> = [];
	let currentGroup: { type: 'context' | 'added' | 'removed'; lines: string[] } = { type: 'context', lines: [] };

	// Itera sobre as linhas de diferença e agrupa-as por tipo (contexto, adicionado ou removido)
	for (const part of compare.diffLines) {
		const lines = part.value.split('\n').filter((l, i, arr) => !(i === arr.length - 1 && l === ''));
		const partType: 'context' | 'added' | 'removed' = part.added ? 'added' : part.removed ? 'removed' : 'context';

		// Se o tipo da parte atual for o mesmo do grupo atual, adiciona as linhas ao grupo; caso contrário, inicia um novo grupo
		if (partType === currentGroup.type) {
			currentGroup.lines.push(...lines);
		} else {
			// Se o grupo atual tiver linhas, adiciona-o à lista de mudanças antes de iniciar um novo grupo
			if (currentGroup.lines.length > 0) {
				changes.push(currentGroup);
			}

			currentGroup = { type: partType, lines };
		}
	}

	// Adiciona o último grupo de linhas, se houver
	if (currentGroup.lines.length > 0) {
		changes.push(currentGroup);
	}

	let leftHtml = '';
	let rightHtml = '';
	let leftLineNum = 1;
	let rightLineNum = 1;
	let i = 0;

	// Itera sobre os grupos de mudanças e constrói o HTML para cada linha, destacando as diferenças conforme o tipo (contexto, adicionado ou removido)
	while (i < changes.length) {
		const change = changes[i];

		// Para linhas de contexto, exibe-as normalmente em ambos os lados
		if (change.type === 'context') {
			// Para cada linha de contexto, adiciona o número da linha e o conteúdo escapado como HTML em ambos os lados
			for (const line of change.lines) {
				const escapedLine = escapeHtml(line);
				leftHtml += `<div class="diff-line line-context"><span class="line-number">${leftLineNum}</span><span class="line-content">${escapedLine}</span></div>`;
				rightHtml += `<div class="diff-line line-context"><span class="line-number">${rightLineNum}</span><span class="line-content">${escapedLine}</span></div>`;
				leftLineNum++;
				rightLineNum++;
			}
			// Para mudanças do tipo 'removed'
		} else if (change.type === 'removed') {
			const nextChange = changes[i + 1];

			// Se a próxima mudança for do tipo 'added', trata como um par de linhas modificadas
			if (nextChange && nextChange.type === 'added') {
				const maxLines = Math.max(change.lines.length, nextChange.lines.length);

				// Itera sobre as linhas do par de mudanças (removida e adicionada) e constrói o HTML para cada linha
				for (let j = 0; j < maxLines; j++) {
					const hasLeftPair = j < change.lines.length;
					const hasRightPair = j < nextChange.lines.length;
					const inlinePair = (hasLeftPair && hasRightPair)
						? buildInlineChangedPair(change.lines[j], nextChange.lines[j])
						: undefined;

					// Para a linha removida, se houver um par correspondente, destaca as partes removidas; caso contrário, exibe a linha normalmente
					if (j < change.lines.length) {
						const oldLine = change.lines[j];
						const contentLeft = hasRightPair
							? inlinePair!.left
							: escapeHtml(oldLine);
						leftHtml += `<div class="diff-line line-deleted"><span class="line-number">${leftLineNum}</span><span class="line-content">${contentLeft}</span></div>`;
						leftLineNum++;
					} else {
						leftHtml += `<div class="diff-line line-empty"><span class="line-number"></span><span class="line-content"></span></div>`;
					}

					// Para a linha adicionada, se houver um par correspondente, destaca as partes adicionadas; caso contrário, exibe a linha normalmente
					if (j < nextChange.lines.length) {
						const newLine = nextChange.lines[j];
						const contentRight = hasLeftPair
							? inlinePair!.right
							: escapeHtml(newLine);
						rightHtml += `<div class="diff-line line-added"><span class="line-number">${rightLineNum}</span><span class="line-content">${contentRight}</span></div>`;
						rightLineNum++;
					} else {
						rightHtml += `<div class="diff-line line-empty"><span class="line-number"></span><span class="line-content"></span></div>`;
					}
				}

				i += 2;
				continue;
			} else {
				// Itera sobre as linhas removidas e constrói o HTML para cada linha, destacando-as como removidas
				for (const line of change.lines) {
					const escapedLine = escapeHtml(line);
					leftHtml += `<div class="diff-line line-deleted"><span class="line-number">${leftLineNum}</span><span class="line-content">${escapedLine}</span></div>`;
					rightHtml += `<div class="diff-line line-empty"><span class="line-number"></span><span class="line-content"></span></div>`;
					leftLineNum++;
				}
			}
			// Para mudanças do tipo 'added'
		} else if (change.type === 'added') {
			// Itera sobre as linhas adicionadas e constrói o HTML para cada linha, destacando-as como adicionadas
			for (const line of change.lines) {
				const escapedLine = escapeHtml(line);
				leftHtml += `<div class="diff-line line-empty"><span class="line-number"></span><span class="line-content"></span></div>`;
				rightHtml += `<div class="diff-line line-added"><span class="line-number">${rightLineNum}</span><span class="line-content">${escapedLine}</span></div>`;
				rightLineNum++;
			}
		}

		i++;
	}

	return { leftLines: leftHtml, rightLines: rightHtml };
}

/**
 * Renderiza o HTML para a comparação de um arquivo específico, utilizando as informações de comparação contidas no objeto HashInfo.
 * 
 * @param compare O objeto HashInfo contendo as informações de comparação para o arquivo, incluindo o nome do arquivo, status da comparação,
 * nomes dos hashes comparados, conteúdos dos arquivos e as linhas de diferença.
 * @returns O HTML gerado para a comparação do arquivo.
 */
export function renderFileDiff(compare: HashInfo) {
	const statusClass = compare.status;
	const statusLabel = {
		'added': t('webview.statusAdded'),
		'deleted': t('webview.statusDeleted'),
		'modified': t('webview.statusModified'),
		'renamed': t('webview.statusRenamed'),
		'error': t('webview.statusError')
	}[compare.status] || t('webview.statusModified');

	const { leftLines, rightLines } = buildSideBySideDiff(compare);

	return `
		<div class="file-diff" data-file="${escapeHtml(compare.file)}">
			<div class="file-diff-header">
				<h3 class="file-name">📄 ${escapeHtml(compare.file)}</h3>
				<div class="file-actions">
				<button class="file-toggle" aria-expanded="true" title="${t('webview.toggleTitle')}">▾</button>
				<span class="file-status ${statusClass}">${statusLabel}</span>
				<button class="file-fullscreen" aria-expanded="false" title="${t('webview.fullscreenEnter')}">⛶</button>
				</div>
			</div>
			<div class="file-content expanded">
				<div class="code-compare">
					<div class="code-space">
						<div class="code-space-header">${escapeHtml(compare.hash1_name)}</div>
						<pre class="sync-scroll hash1">${leftLines}</pre>
					</div>
					<div class="code-space">
						<div class="code-space-header">${escapeHtml(compare.hash2_name)}</div>
						<pre class="sync-scroll hash2">${rightLines}</pre>
					</div>
				</div>
			</div>
		</div>
	`;
}

/**
 * Renderiza o HTML para a comparação de um conjunto de arquivos, utilizando as informações de comparação contidas nos objetos HashInfo.
 * 
 * @param gitService O serviço Git utilizado para obter o conteúdo dos arquivos comparados.
 * @param files A lista de arquivos a serem comparados.
 * @param hash1 O hash do primeiro branch ou commit a ser comparado.
 * @param hash2 O hash do segundo branch ou commit a ser comparado.
 * @param statsHtml O HTML contendo as estatísticas da comparação (número de arquivos alterados, adições, deleções, etc.) a ser incluído no início do resultado.
 * @returns O HTML gerado para a comparação dos arquivos, incluindo as estatísticas e as comparações lado a lado para cada arquivo.
 */
export async function renderDiffHtml(gitService: GitService, files: string[], hash1: string, hash2: string, statsHtml: string): Promise<string> {
	// Se o serviço Git não estiver disponível, retorna apenas o HTML das estatísticas sem as comparações dos arquivos
	if (!gitService) {
		return statsHtml + '';
	}

	const results: HashInfo[] = [];
	const batchSize = 5;

	// Itera sobre os arquivos em lotes para evitar sobrecarregar o sistema ao obter o conteúdo dos arquivos e calcular as diferenças
	for (let i = 0; i < files.length; i += batchSize) {
		const batch = files.slice(i, i + batchSize);

		await Promise.all(batch.map(async (file) => {
			try {
				const [content1, content2] = await Promise.all([
					gitService.getFileContent(hash1, file),
					gitService.getFileContent(hash2, file)
				]);

				const diffLines = Diff.diffLines(content1 || '', content2 || '');

				let status = 'modified';

				// Verifica o status do arquivo com base na presença ou ausência de conteúdo em cada hash
				if (!content1 && content2) {
					status = 'added';
				} else if (content1 && !content2) {
					status = 'deleted';
				}

				results.push(new HashInfo(
					file,
					status,
					hash1,
					hash2,
					content1 || t('webview.fileMissing'),
					content2 || t('webview.fileMissing'),
					diffLines
				));
			} catch (error) {
				results.push(new HashInfo(
					file,
					'error',
					hash1,
					hash2,
					t('webview.loadError'),
					t('webview.loadError'),
					[]
				));
			}
		}));
	}

	results.sort((a, b) => a.file.localeCompare(b.file));

	const htmlContent = statsHtml + results.map(r => renderFileDiff(r)).join('');
	return htmlContent;
}
