/**
 * Representa uma linha individual de uma diferença.
 */
export interface DiffLine {
	/** Tipo da linha: adicionada, removida ou contexto */
	type: DiffLineType;
	/** Conteúdo da linha */
	content: string;
	/** Número da linha no arquivo antigo (undefined se for adição) */
	oldLineNumber?: number;
	/** Número da linha no arquivo novo (undefined se for deleção) */
	newLineNumber?: number;
}

/**
 * Representa um bloco de diferenças (hunk) de um diff.
 */
export interface DiffHunk {
	/** Linha inicial no arquivo antigo */
	oldStart: number;
	/** Quantidade de linhas no arquivo antigo */
	oldLines: number;
	/** Linha inicial no arquivo novo */
	newStart: number;
	/** Quantidade de linhas no arquivo novo */
	newLines: number;
	/** Linhas de diferença neste bloco */
	changes: DiffLine[];
}

/**
 * Representa as diferenças de um arquivo entre dois commits.
 */
export interface FileDiff {
	/** Nome/caminho do arquivo */
	fileName: string;
	/** Status do arquivo (adicionado, modificado, deletado, renomeado) */
	status: FileStatus;
	/** Conteúdo do arquivo no commit antigo */
	oldContent: string;
	/** Conteúdo do arquivo no commit novo */
	newContent: string;
	/** Blocos de diferença */
	hunks: DiffHunk[];
}

/**
 * Informações sobre um commit do Git.
 */
export interface CommitInfo {
	/** Hash curto do commit */
	hash: string;
	/** Hash completo do commit */
	fullHash: string;
	/** Mensagem do commit */
	message: string;
	/** Autor do commit */
	author: string;
	/** Data do commit */
	date: string;
}

/**
 * Informações sobre um branch do Git.
 */
export interface BranchInfo {
	/** Nome do branch */
	name: string;
	/** Se é o branch atual */
	isCurrent: boolean;
	/** Se é um branch remoto */
	isRemote: boolean;
}

/**
 * Resultado de uma comparação entre dois commits.
 */
export interface CompareResult {
	/** Referência do commit base (antigo) */
	baseRef: string;
	/** Referência do commit comparado (novo) */
	compareRef: string;
	/** Lista de arquivos com diferenças */
	files: FileDiff[];
	/** Total de arquivos alterados */
	totalFiles: number;
	/** Total de adições */
	totalAdditions: number;
	/** Total de deleções */
	totalDeletions: number;
}

/**
 * Mensagem enviada do webview para a extensão.
 */
export interface WebviewMessage {
	command: string;
	[key: string]: unknown;
}

/**
 * Mensagem de comparação enviada do webview.
 */
export interface CompareMessage extends WebviewMessage {
	command: 'compare';
	hash1: string;
	hash2: string;
}

/**
 * Mensagem de resultado enviada para o webview.
 */
export interface ResultMessage {
	command: 'showResult';
	html: string;
}

/**
 * Status de um arquivo que foi alterado entre dois commits.
 */
export type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed';

/**
 * Tipo de uma linha de diferença.
 */
export type DiffLineType = 'add' | 'delete' | 'context';

/**
 * Tipos usados pela UI (sidebar / webview)
 */
export type BranchSlot = 'branch1' | 'branch2';

/**
 * Nó da sidebar, representando um item que pode ser um campo de branch,
 * uma ação de comparação, um grupo de commits ou um commit individual.
 */
export type SidebarNode =
	| { kind: 'branchField'; slot: BranchSlot }
	| { kind: 'compareAction' }
	| { kind: 'commitGroup'; slot: BranchSlot; branch: string }
	| { kind: 'commit'; slot: BranchSlot; branch: string; commit: CommitInfo }
	| { kind: 'info'; label: string; description?: string };
