import 'dotenv/config';
import { google } from 'googleapis';
import MailComposer from 'nodemailer/lib/mail-composer';
import Stripe from 'stripe';
import logger from './logger';

const auth =
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN
        ? new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
        : null;
if (auth) {
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
}

const client = google.gmail({ version: 'v1', auth });

const stripe = process.env.STRIPE_SK
    ? new Stripe(process.env.STRIPE_SK, {
          apiVersion: '2022-11-15',
      })
    : null;

const encodeMessage = (message) =>
    Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function sendRevokedEmailToUserId(userId: string) {
    if (!stripe || !client) {
        return;
    }
    const email = await emailFromUserId(userId);
    if (email) {
        logger.info(`${userId} is revoked, sending revoked email to ${email}`);
        await sendRevokedEmail(email);
    }
}

/**
 * Get the Stripe email address of a user from its userId
 * @param userId the userId
 */
async function emailFromUserId(userId: string) {
    const activeSubscription = (
        await stripe.subscriptions.search({
            query: `metadata['userId']:'${userId}'`,
            limit: 100,
            expand: ['data.customer'],
        })
    ).data.filter((s) => s.status === 'active' || s.status === 'trialing')[0];

    return (activeSubscription?.customer as Stripe.Customer | null)?.email;
}

/**
 * Send an email to a user to tell him that his Twitter account has been disconnected from Unfollow Monkey
 * @param to the email address of the user
 */
export async function sendRevokedEmail(to: string) {
    const mailComposer = new MailComposer({
        to,
        from: 'Unfollow Monkey <love@unfollow-monkey.com>',
        subject: 'Your Twitter account has been disconnected from Unfollow Monkey',
        text:
            'Hello,\n' +
            '\n' +
            'It looks like your Unfollow Monkey app has been disconnected from Twitter.\n' +
            '\n' +
            'This can happen when Twitter accounts are temporarily disabled for instance.\n' +
            '\n' +
            'Please\n' +
            "- Log in again to Unfollow Monkey if you'd like to fix this\n" +
            "- or tell me whether you'd like to cancel your subscription\n" +
            '\n' +
            'Thank you and best regards,\n' +
            '\n' +
            'Paul',
        textEncoding: 'base64',
    });
    const message = await mailComposer.compile().build();
    await client.users.messages.send({
        userId: 'me',
        requestBody: {
            raw: encodeMessage(message),
        },
    });
}
