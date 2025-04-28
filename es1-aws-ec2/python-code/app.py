from flask import Flask
from flask import request

app = Flask(__name__)

@app.route('/')
def hello_world():
  app.logger.info('Caller ip ---> %s', request.remote_addr)
  return 'Hello from Flask running on EC2!'

if __name__ == '__main__':
  app.run(host='0.0.0.0', port=5000, debug=True)
