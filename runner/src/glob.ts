const escape = (s: string): string => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

export const globToRegExp = (glob: string): RegExp =>
    new RegExp('^' + glob.split('**').map((part) => part.split('*').map(escape).join('[^/]*')).join('.*') + '$');

export const scopeOk = (changed: string[], allowed: string[]): boolean => {
    const patterns = allowed.map(globToRegExp);
    return changed.length > 0 && changed.every((file) => patterns.some((re) => re.test(file)));
};
