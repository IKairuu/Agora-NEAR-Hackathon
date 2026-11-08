const escape = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
export const globToRegExp = (glob) => new RegExp('^' + glob.split('**').map((part) => part.split('*').map(escape).join('[^/]*')).join('.*') + '$');
export const scopeOk = (changed, allowed) => {
    const patterns = allowed.map(globToRegExp);
    return changed.length > 0 && changed.every((file) => patterns.some((re) => re.test(file)));
};
