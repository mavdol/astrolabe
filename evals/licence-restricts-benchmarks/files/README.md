# session-service

Keeps user sessions for the web app: about 2,000 reads and 200 writes per second at peak, sessions expire after 30 minutes. We need to pick a key-value store for the session cache; the two candidates are vendored in vendor/.
