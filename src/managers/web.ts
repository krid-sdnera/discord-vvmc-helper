import { Logger } from "../util/logger";
import express, { Express, Request, Response } from "express";
import { BotManager } from ".";
import { ListUsersOptions } from "./database";

export class WebManager {
  private logger: Logger;
  private port: number;
  private app: Express;
  private manager: BotManager;

  constructor(manager: BotManager, port: number, logger: Logger) {
    console.time("[bot:manager:web] initialise");
    this.port = port;
    this.manager = manager;
    this.logger = logger.setPrefix("bot:manager:web");
    this.app = express();
    console.timeEnd("[bot:manager:web] initialise");
  }

  initialiseHandlers() {
    this.app.use(express.json());
    this.app.get("/verify", (req, res) => this.handleGetVerify(req, res));
    this.app.post("/verify", (req, res) => this.handlePostVerify(req, res));
    this.app.get("/admin/list", (req, res) =>
      this.handleGetAdminList(req, res)
    );
    this.app.post("/admin/update", (req, res) =>
      this.handlePostAdminUpdate(req, res)
    );
  }

  async listen() {
    console.time("[bot:manager:web] begin listening");
    this.initialiseHandlers();

    this.app.listen(this.port);
    console.timeEnd("[bot:manager:web] begin listening");
  }

  async handleGetVerify(req: Request, res: Response) {
    const head = [];
    head.push(
      "<title>Verify yourself with VicVents Discord and Minecraft server</title>"
    );

    const body = [];

    const form = [];
    form.push(`<form id="verifyForm">`);
    form.push(`<div>`);
    form.push(`<label for="email">Email Address</label>`);
    form.push(`<input name="email" type="email" />`);
    form.push(`</div>`);
    form.push(`<div>`);
    form.push(`<label for="membershipNumber">Membership Number</label>`);
    form.push(`<input name="membershipNumber" type="text" />`);
    form.push(`</div>`);
    form.push(`<div>`);
    form.push(`<label for="firstname">Firstname</label>`);
    form.push(`<input name="firstname" type="text" />`);
    form.push(`</div>`);
    form.push(`<div>`);
    form.push(`<label for="lastname">Lastname</label>`);
    form.push(`<input name="lastname" type="text" />`);
    form.push(`</div>`);
    form.push(`<div>`);
    form.push(`<label for="minecraftUsername">Minecraft Username</label>`);
    form.push(`<input name="minecraftUsername" type="text" />`);
    form.push(`</div>`);
    form.push(`<div>`);
    form.push(`<input name="submit" type="submit" value="Verify" />`);
    form.push(`</div>`);
    form.push(`</form>`);

    body.push(...form);

    body.push(`<div id="message"></div>`);

    body.push(
      `
<script>
window.document.forms.verifyForm.onsubmit = function(e) {
  e.preventDefault();
  document.querySelector('#message').innerText = 'Okie dokie, checking. Hold on to your hats';

  fetch('verify', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'}, 
    body: JSON.stringify({
      email: window.document.forms.verifyForm.querySelector('[name=email]').value,
      membershipNumber: window.document.forms.verifyForm.querySelector('[name=membershipNumber]').value,
      firstname: window.document.forms.verifyForm.querySelector('[name=firstname]').value,
      lastname: window.document.forms.verifyForm.querySelector('[name=lastname]').value,
      minecraftUsername: window.document.forms.verifyForm.querySelector('[name=minecraftUsername]').value,
    })
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.success) {
        window.document.forms.verifyForm.style.display = 'none';
        document.querySelector('#message').innerText = 'You have been verified. You can now join the VicVents minecraft server. play.vicvents-mc.ga';
      } else {
        document.querySelector('#message').innerText = 'lol whoop, an error: ' + data.message;
      }

    })
  return false;
}
</script>
`
    );
    res.send(`
    <!DOCTYPE html>
    <head>
    ${head.join("\n")}
    </head>
    <body>
    ${body.join("\n")}
    </body>
    </html>
    `);
  }
  async handlePostVerify(req, res: Response) {
    const body = req.body;
    const emailRe =
      /^(([^<>()[\]\.,;:\s@\"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;
    if (!body.email || !emailRe.test(body.email)) {
      res.send({ success: false, message: "Can haz valid email?" });
      return;
    }

    if (!body.membershipNumber || !body.membershipNumber.trim()) {
      res.send({ success: false, message: "Can haz membershipNumber?" });
      return;
    }

    if (!body.firstname || !body.firstname.trim()) {
      res.send({ success: false, message: "Can haz firstname?" });
      return;
    }

    if (!body.lastname || !body.lastname.trim()) {
      res.send({ success: false, message: "Can haz lastname?" });
      return;
    }

    if (!body.minecraftUsername || !body.minecraftUsername.trim()) {
      res.send({ success: false, message: "Can haz minecraft Username?" });
      return;
    }

    try {
      await this.manager.verifyExtranet(
        {
          membershipNumber: body.membershipNumber,
          firstname: body.firstname,
          lastname: body.lastname,
        },
        { email: body.email }
      );

      await this.manager.linkMinecraftUsername(
        { minecraftUsername: body.minecraftUsername },
        { email: body.email }
      );
    } catch (e) {
      res.send({ success: false, message: e.message });
      return;
    }

    res.send({ success: true });
  }

  async handleGetAdminList(req: Request, res: Response) {
    try {
      const options: ListUsersOptions = {
        page: Number(req.query.page ?? 1),
        perPage: 50,
      };

      const users = await this.manager.listUsers(options);
      res.send({ success: false, users: users });
    } catch (e) {
      res.send({ success: false, message: e.message });
      throw e;
    }
  }

  async handlePostAdminUpdate(req: Request, res: Response) {
    const body = req.body;
    try {
      await this.manager.verifyExtranet(
        {
          membershipNumber: body.membershipNumber,
          firstname: body.firstname,
          lastname: body.lastname,
        },
        {
          email: body.email,
        }
      );

      if (body.minecraftUsername) {
        await this.manager.linkMinecraftUsername(
          {
            minecraftUsername: body.minecraftUsername,
          },
          {
            email: body.email,
          }
        );
      }
    } catch (e) {
      res.send({ success: false, message: e.message });
      return;
    }

    res.send({ success: true });
  }
}
