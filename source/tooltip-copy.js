export function tooltipCopy(value) {
  return value.replace(/(^|[^\S\r\n]+)[·•](?:[^\S\r\n]+|$)/gu, ' ').replaceAll('\u2014', '-')
}
