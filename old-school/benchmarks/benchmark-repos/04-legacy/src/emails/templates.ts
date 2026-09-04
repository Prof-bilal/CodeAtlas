// Email templates - OLD
// DEPRECATED - use templates directory

export const emailTemplates = {
  welcome: (name: string) => 
    <h1>Welcome !</h1>
    <p>Thank you for joining our platform.</p>
  ,
  passwordReset: (token: string) => 
    <h1>Password Reset</h1>
    <p>Click <a href="/reset?token=">here</a> to reset your password.</p>
  ,
  invoice: (amount: number) => 
    <h1>Invoice</h1>
    <p>Your payment of {amount} has been processed.</p>
  ,
};

// TODO: move to templates directory
export function sendEmail(to: string, subject: string, html: string) {
  console.log(Sending email to : );
}
