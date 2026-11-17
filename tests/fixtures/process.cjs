console.log('KUBE_EVENT {"type":"step","message":"Fixture process running"}');
console.error('Fixture failure evidence');
process.exitCode = 7;
