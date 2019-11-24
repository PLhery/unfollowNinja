# -- For workers only, this does not launch the API
FROM node:12

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm ci --only=production

# Bundle app source
COPY . .
RUN npm build

CMD [ "npm", "start" ]
