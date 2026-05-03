/**
 * Converte caracteres especiais em uma string para evitar problemas de segurança, como XSS, ao exibir o conteúdo em HTML.
 * 
 * @param text A string a ser convertida
 * @returns A string convertida, segura para exibição em HTML
 */
export function escapeHtml(text: string) {
	if (!text) return '';

	return text.replace(/[&<>"']/g, function (c) {
		return {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#39;'
		}[c] || c;
	});
}

/**
 * Gera um nonce (número usado uma vez) aleatório.
 * 
 * @returns Um nonce aleatório de 32 caracteres.
 */
export function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

	// Gera um nonce de 32 caracteres usando caracteres alfanuméricos
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}

	return text;
}
