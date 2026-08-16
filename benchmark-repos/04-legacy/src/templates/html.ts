// HTML templates - OLD
// DEPRECATED

export const baseLayout = (content: string) => 
<!DOCTYPE html>
<html>
<head><title>MyApp</title></head>
<body></body>
</html>
;

export const welcomePage = baseLayout(
  <h1>Welcome to MyApp</h1>
  <p>Get started by creating your first project.</p>
);
