Next Pieces


- remove capital on email login
-

- Social Sign In/up
- Check all settings and disable any that are not needed
- After signup, redirect to chat page
- Update GPT-Icon to new icon
- Update prompt to handle CodeCan Building Code context
- Create iOS app version
- Implement in-app billing for paid plans
    - Revenue Cat Integration
- Help and FAQ
    - Change Help to contact email
- Website
    - Terms and Privacy Policy pages


DONE
- Check all features like file search and code interpreter
- Determine why the messages are not being saved on production
- Find out speed issue








For the following changes, I want you to come up with a detailed and logical plan for implementing them.
Name
- Take anywhere CodeCan AI is used and turn it into a Variable so it can be changed easily in the future.
- Look for places in the UI where GPT-5 is mentioned and turn that into the same variable as above.

Welcome to LibreChat! Enjoy your experience.

PDF Viewer
- Embed a PDF viewer into the application to allow users to view the CodeCan Building Code directly within the app.
- Presenting the PDF viewer will be triggered when the user clicks on a link in the citations. The PDF will be in a folder called PDFS.
- The citation links will open the Specific page in the PDF viewer. Right now the links back from Open AI are in the format of `nbc2020_page_845.json` so we will need to convert that to `nbc2020.pdf#page=845` when opening the PDF viewer.

Production

- Need Email Host and Port



The goal is to release a version of LibreChat that is limited to the CodeCan Building Code. The documentation  The tool will call a dedicated Open AI model that has the CodeCan building code attached. The application will answer the chats and provide citations from the building code.

To begin, we need to remove a few features.

Left Sidepanel Menu
    - Remove Agent Marketplace from Menu

Right Menu
- Hide Entire Right Menu that contains Agent Builder, Promptes, Memories, etc

Footer
- Change from LibreChat v0.8.0 - Every AI for Everyone. to CodeCan AI

Chat top Menu
- Remove Top Menu that includes model picker, presets, etc

Then we need to modify the code to call OpenAI with a prebuilt prompt that includes the CodeCan Building Code context. We will need to extend LibreChat to support citations.

I need a detailed and logical plan for implementing these changes.

- Remove Terms of Service after registration
- Sign in automatically after registration

- Change Message "Welcome to LibreChat! Enjoy your expierience" to "Welcome to Ontrario CodeCan AI! How can I assist you with the CodeCan Building Code today?"
- The sidebar icon disappears after clicking it

- I NEED AN ICON - Treillium Leaf or something that represents CodeCan
