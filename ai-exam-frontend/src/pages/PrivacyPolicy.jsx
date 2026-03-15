import React from "react";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-gray-100 text-gray-700">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Privacy Policy for ExamAI
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          <strong>Last Updated:</strong>{" "}
          {new Date().toISOString().split("T")[0]}
        </p>

        <div className="space-y-6 text-sm md:text-base leading-relaxed">
          <p>
            Welcome to ExamAI. We are committed to protecting your privacy. This
            Privacy Policy explains how we collect, use, disclose, and safeguard
            your information when you use our application.
          </p>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              1. Information We Collect
            </h2>
            <p className="mb-2">
              We may collect information about you in a variety of ways. The
              information we may collect includes:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Personal Data:</strong> Personally identifiable
                information, such as your name, email address, and exam
                preferences that you voluntarily give to us when you register
                with the application.
              </li>
              <li>
                <strong>Chat and Interaction Data:</strong> All content you
                provide during your interactions with our AI, including text
                prompts, uploaded files (images, PDFs), and generated responses.
                This is used to provide the service and for the "Memory" feature
                to personalize your experience.
              </li>
              <li>
                <strong>Quiz and Performance Data:</strong> Information about
                the quizzes you take, including topics, scores, and time taken,
                to track your progress.
              </li>
              <li>
                <strong>Resume Data:</strong> If you use our Resume Builder, we
                collect the information you provide to create your resume.
              </li>
              <li>
                <strong>Device Data:</strong> We may collect your device's push
                notification token (FCM Token) to send you relevant alerts, such
                as job notifications and current affairs updates.
              </li>
              <li>
                <strong> Authentication Data:</strong> If you sign in using
                Google Sign-In, we receive basic profile information such as
                your name and email address from Google to create your account.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              2. How We Use Your Information
            </h2>
            <p className="mb-2">
              Having accurate information about you permits us to provide you
              with a smooth, efficient, and customized experience. Specifically,
              we may use information collected about you to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Create and manage your account.</li>
              <li>Personalize your experience with our AI tutor.</li>
              <li>
                Provide you with services like quiz generation, chat, and resume
                building.
              </li>
              <li>
                Send you push notifications about job alerts or other relevant
                content.
              </li>
              <li>
                Monitor and analyze usage and trends to improve your experience
                with the application.
              </li>
              <li>
                Anonymously pool quiz questions to serve them to other users,
                improving efficiency.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              3. Disclosure of Your Information
            </h2>
            <p className="mb-2">
              We do not sell your personal information. We may share information
              we have collected about you in certain situations with third-party
              service providers that perform services for us or on our behalf,
              including:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>AI Service Providers (Groq, OpenAI, Google):</strong> To
                process your queries and generate AI responses.
              </li>
              <li>
                <strong>Search Providers (Serper):</strong> To provide live web
                search results for up-to-date information.
              </li>
              <li>
                <strong>
                  Image Generation & Hosting Providers (Infip, Catbox, etc.):
                </strong>{" "}
                To generate and edit images based on your prompts.
              </li>
              <li>
                <strong>
                  Push Notification Services (Firebase Cloud Messaging):
                </strong>{" "}
                To deliver notifications to your device.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              4. Data Security
            </h2>
            <p>
              We use administrative, technical, and physical security measures
              to help protect your personal information. While we have taken
              reasonable steps to secure the personal information you provide to
              us, please be aware that despite our efforts, no security measures
              are perfect or impenetrable, and no method of data transmission
              can be guaranteed against any interception or other type of
              misuse.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              5. Data Retention and Deletion
            </h2>
            <p>
              We will retain your personal information only for as long as is
              necessary for the purposes set out in this Privacy Policy. You
              have the right to request the deletion of your personal data. Our
              application provides a feature to delete your account and all
              associated data, which you can typically find in your user profile
              settings. This action is irreversible and will permanently remove
              your account, chats, quiz results, and other associated data from
              our active databases.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              6. Policy for Children
            </h2>
            <p>
              We do not knowingly solicit information from or market to children
              under the age of 13. If you become aware of any data we have
              collected from children under age 13, please contact us using the
              contact information provided below.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              7. Changes to This Privacy Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. We will
              notify you of any changes by posting the new Privacy Policy on
              this page. You are advised to review this Privacy Policy
              periodically for any changes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              8. Contact Us
            </h2>
            <p>
              If you have questions or comments about this Privacy Policy,
              please contact us at:{" "}
              <a
                href="mailto:support@examai-in.com"
                className="text-blue-600 hover:underline font-medium"
              >
                support@examai-in.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
