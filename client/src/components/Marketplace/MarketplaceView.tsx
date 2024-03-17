import { useState } from 'react';

import { Button, Input } from '../ui';
import Fuse, { FuseResult } from 'fuse.js';
import { ChevronLeft } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import PresetCard from './PresetCard';
import PresetSidebar from './PresetSidebar';
import { Preset } from './types';

function MarketplaceView() {
  const navigate = useNavigate();
  const location = useLocation();

  const presets: Preset[] = [
    {
      metadata: {
        jobTitle: '3D Generalist',
        taskName: 'AR Development: Develop AR applications or experiences',
        marketingText:
          'Empower your AR development process with AI-driven insights. Our tool offers foundational recommendations for creating immersive AR applications or experiences, focusing on design principles, user interface considerations, and interaction design.',
        limitations:
          'While the AI can provide general principles and recommendations for AR development, human expertise is crucial for the actual design and implementation. Specialized knowledge in AR development tools and technologies is essential for effective execution.',
      },
      modalComponents: [
        {
          type: 'multi_line_text',
          labelTitle: 'Development Goals',
          labelDescription:
            'What are the specific goals or objectives for developing the AR application or experience?',
          placeholder:
            'Describe the specific goals or objectives for developing the AR application or experience.',
          example:
            'Our goal is to create an AR application that enhances the museum experience by providing interactive historical visualizations.',
          validation: {
            pattern: '.{20,}',
            required: true,
            errorMessage: 'Must be 20 charecter long.',
          },
        },
        {
          type: 'multi_line_text',
          labelTitle: 'Target Audience',
          labelDescription: 'Who is the intended audience for the AR application or experience?',
          placeholder: 'Describe the intended audience for the AR application or experience.',
          example:
            'The target audience includes students and educators interested in interactive learning experiences.',
          validation: {
            pattern: '.{20,}',
            required: true,
            errorMessage: 'Must be 20 charecter long.',
          },
        },
        {
          type: 'multi_line_text',
          labelTitle: 'Key Features',
          labelDescription:
            'List the key features or functionalities you want to incorporate into the AR application or experience.',
          placeholder:
            'E.g., Interactive storytelling, 3D object recognition, Real-time information display.',
          example:
            'We aim to incorporate interactive storytelling, 3D object recognition, and real-time information display into the AR experience.',
          validation: {
            pattern: '.{20,}',
            required: true,
            errorMessage: 'Must be 20 charecter long.',
          },
        },
        { type: 'button', buttonText: 'Generate Development Guidelines' },
      ],
      system_prompt:
        'As a 3D Generalist, your expertise in crafting immersive AR experiences is invaluable. Your understanding of 3D modeling, animation, and interactive design allows you to create visually stunning and functionally compelling AR applications or experiences. Your role involves understanding user interaction, interface design, and the technical aspects of AR development, ensuring that your contributions captivate and engage users.\n\nYour responsibilities include:\n\n- **Immersive Experiences**: Your focus is on creating AR applications or experiences that provide captivating and engaging interactions, drawing on your expertise in 3D design and interactive storytelling.\n- **User-Centric Design**: You prioritize user experience, ensuring that the AR applications or experiences are intuitive, visually appealing, and seamlessly integrated into users\' environments.\n- **Technical Proficiency**: Your understanding of AR development tools and technologies bridges the gap between creative vision and technical implementation.\n- **Collaborative Mindset**: You excel in multidisciplinary collaboration, working closely with developers, designers, and stakeholders to bring AR concepts to life.\n\nTo proceed with generating the development guidelines, provide the specific goals or objectives for the AR application or experience, the intended audience, and the key features or functionalities you aim to incorporate into the AR application or experience. Based on this information, the AI will offer foundational recommendations for creating immersive AR applications or experiences.',
      user_prompt:
        '# AR Development: Creating Immersive Experiences\n\nYour task is to develop AR applications or experiences that captivate and engage users. The AI will provide foundational recommendations for creating immersive AR experiences based on the detailed input you provide. These recommendations will focus on design principles, user interface considerations, and interaction design.\n\nFollow these steps to complete the task:\n\n1. Define the specific goals or objectives for developing the AR application or experience.\n2. Describe the intended audience for the AR application or experience.\n3. List the key features or functionalities you want to incorporate into the AR application or experience.\n\n# Development Goals\n{{Development Goals}}\n\n# Target Audience\n{{Target Audience}}\n\n# Key Features\n{{Key Features}}\n\n# Generated Development Guidelines\n',
      icon: 'https://chat-preview.lobehub.com/_next/image?url=https%3A%2F%2Fregistry.npmmirror.com%2F%40lobehub%2Fassets-emoji-anim%2Flatest%2Ffiles%2Fassets%2Fmovie-camera.webp&w=96&q=75',
    },
    {
      metadata: {
        jobTitle: 'UX Designer',
        taskName: 'Accessibility Design: Ensure Accessibility Compliance',
        marketingText:
          'Empower your user interface design with AI-driven accessibility compliance. Leverage expert guidance and tailored recommendations to create an inclusive and accessible user experience.',
        limitations:
          'While AI can offer insights and recommendations for accessibility compliance, human expertise is essential for the nuanced implementation and customization of design elements to cater to specific user needs and abilities.',
      },
      modalComponents: [
        {
          type: 'multi_line_text',
          labelTitle: 'Design Goals',
          labelDescription:
            'Specify your design goals for the user interface and what you aim to achieve.',
          placeholder:
            'E.g., Create an intuitive interface accessible to all users, regardless of their abilities.',
          example:
            'Our design goals are to ensure an intuitive and user-friendly interface that provides a seamless and inclusive experience for all users.',
          validation: {
            pattern: '.{20,}',
            required: true,
            errorMessage: 'Must be 20 charecter long.',
          },
        },
        {
          type: 'multi_line_text',
          labelTitle: 'Target Audience',
          labelDescription:
            'Describe the characteristics of your target audience and any specific accessibility considerations.',
          placeholder:
            'E.g., Users with visual impairments, motor disabilities, cognitive disabilities.',
          example:
            'Our target audience includes individuals with visual impairments, motor disabilities, and cognitive disabilities. We need to ensure our design is accessible to screen readers, supports keyboard navigation, and provides clear content.',
          validation: {
            pattern: '.{20,}',
            required: true,
            errorMessage: 'Must be 20 charecter long.',
          },
        },
        {
          type: 'file_upload',
          labelTitle: 'Design Materials',
          labelDescription:
            'Upload any existing design materials or prototypes to provide context for tailored recommendations.',
          buttonText: 'Upload Design Materials',
          validation: { pattern: '.*', required: false },
        },
        { type: 'button', buttonText: 'Get Accessibility Recommendations' },
      ],
      system_prompt:
        'As a UX Designer, your role in ensuring accessibility compliance is pivotal for creating an inclusive user experience. Your expertise in design principles and interaction considerations equips you to address the diverse needs of users with empathy and precision. Your approach to accessibility design reflects a commitment to barrier-free user experiences.\n\nIn response to your request, the AI will:\n\n1. Review your specified design goals to align recommendations with your vision for an inclusive user interface.\n2. Consider the characteristics and specific accessibility considerations of your target audience to tailor recommendations to their diverse needs.\n3. Utilize existing design materials or prototypes, if provided, to deliver context-aware and accurate accessibility recommendations.\n\nThe generated accessibility recommendations will be customized to your design goals, target audience, and existing materials, ensuring an inclusive and accessible user interface.',
      user_prompt:
        '# Ensuring Accessibility Compliance in User Interface Design\n\nAs a UX designer, your task is to ensure accessibility compliance in your user interface design. This includes creating an inclusive and accessible design that caters to users with different abilities. Our AI can provide expert guidance and recommendations to help you achieve accessibility compliance.\n\nFollow these steps to ensure accessibility in your user interface design:\n\n1. Design Goals: {{Design Goals}} \n2. Target Audience: {{Target Audience}}',
      icon: 'https://chat-preview.lobehub.com/_next/image?url=https%3A%2F%2Fregistry.npmmirror.com%2F%40lobehub%2Fassets-emoji-anim%2Flatest%2Ffiles%2Fassets%2Fman-technologist.webp&w=96&q=75',
    },
    {
      metadata: {
        jobTitle: '3D Generalist',
        taskName: 'AR Development: Develop AR applications or experiences',
        marketingText:
          'Empower your AR development process with AI-driven insights. Our tool offers foundational recommendations for creating immersive AR applications or experiences, focusing on design principles, user interface considerations, and interaction design.',
        limitations:
          'While the AI can provide general principles and recommendations for AR development, human expertise is crucial for the actual design and implementation. Specialized knowledge in AR development tools and technologies is essential for effective execution.',
      },
      modalComponents: [
        {
          type: 'multi_line_text',
          labelTitle: 'Development Goals',
          labelDescription:
            'What are the specific goals or objectives for developing the AR application or experience?',
          placeholder:
            'Describe the specific goals or objectives for developing the AR application or experience.',
          example:
            'Our goal is to create an AR application that enhances the museum experience by providing interactive historical visualizations.',
          validation: {
            pattern: '.{20,}',
            required: true,
            errorMessage: 'Must be 20 charecter long.',
          },
        },
        {
          type: 'multi_line_text',
          labelTitle: 'Target Audience',
          labelDescription: 'Who is the intended audience for the AR application or experience?',
          placeholder: 'Describe the intended audience for the AR application or experience.',
          example:
            'The target audience includes students and educators interested in interactive learning experiences.',
          validation: {
            pattern: '.{20,}',
            required: true,
            errorMessage: 'Must be 20 charecter long.',
          },
        },
        {
          type: 'multi_line_text',
          labelTitle: 'Key Features',
          labelDescription:
            'List the key features or functionalities you want to incorporate into the AR application or experience.',
          placeholder:
            'E.g., Interactive storytelling, 3D object recognition, Real-time information display.',
          example:
            'We aim to incorporate interactive storytelling, 3D object recognition, and real-time information display into the AR experience.',
          validation: {
            pattern: '.{20,}',
            required: true,
            errorMessage: 'Must be 20 charecter long.',
          },
        },
        { type: 'button', buttonText: 'Generate Development Guidelines' },
      ],
      system_prompt:
        'As a 3D Generalist, your expertise in crafting immersive AR experiences is invaluable. Your understanding of 3D modeling, animation, and interactive design allows you to create visually stunning and functionally compelling AR applications or experiences. Your role involves understanding user interaction, interface design, and the technical aspects of AR development, ensuring that your contributions captivate and engage users.\n\nYour responsibilities include:\n\n- **Immersive Experiences**: Your focus is on creating AR applications or experiences that provide captivating and engaging interactions, drawing on your expertise in 3D design and interactive storytelling.\n- **User-Centric Design**: You prioritize user experience, ensuring that the AR applications or experiences are intuitive, visually appealing, and seamlessly integrated into users\' environments.\n- **Technical Proficiency**: Your understanding of AR development tools and technologies bridges the gap between creative vision and technical implementation.\n- **Collaborative Mindset**: You excel in multidisciplinary collaboration, working closely with developers, designers, and stakeholders to bring AR concepts to life.\n\nTo proceed with generating the development guidelines, provide the specific goals or objectives for the AR application or experience, the intended audience, and the key features or functionalities you aim to incorporate into the AR application or experience. Based on this information, the AI will offer foundational recommendations for creating immersive AR applications or experiences.',
      user_prompt:
        '# AR Development: Creating Immersive Experiences\n\nYour task is to develop AR applications or experiences that captivate and engage users. The AI will provide foundational recommendations for creating immersive AR experiences based on the detailed input you provide. These recommendations will focus on design principles, user interface considerations, and interaction design.\n\nFollow these steps to complete the task:\n\n1. Define the specific goals or objectives for developing the AR application or experience.\n2. Describe the intended audience for the AR application or experience.\n3. List the key features or functionalities you want to incorporate into the AR application or experience.\n\n# Development Goals\n{{Development Goals}}\n\n# Target Audience\n{{Target Audience}}\n\n# Key Features\n{{Key Features}}\n\n# Generated Development Guidelines\n',
      icon: 'https://chat-preview.lobehub.com/_next/image?url=https%3A%2F%2Fregistry.npmmirror.com%2F%40lobehub%2Fassets-emoji-anim%2Flatest%2Ffiles%2Fassets%2Fmovie-camera.webp&w=96&q=75',
    },
    {
      metadata: {
        jobTitle: 'UX Designer',
        taskName: 'Accessibility Design: Ensure Accessibility Compliance',
        marketingText:
          'Empower your user interface design with AI-driven accessibility compliance. Leverage expert guidance and tailored recommendations to create an inclusive and accessible user experience.',
        limitations:
          'While AI can offer insights and recommendations for accessibility compliance, human expertise is essential for the nuanced implementation and customization of design elements to cater to specific user needs and abilities.',
      },
      modalComponents: [
        {
          type: 'multi_line_text',
          labelTitle: 'Design Goals',
          labelDescription:
            'Specify your design goals for the user interface and what you aim to achieve.',
          placeholder:
            'E.g., Create an intuitive interface accessible to all users, regardless of their abilities.',
          example:
            'Our design goals are to ensure an intuitive and user-friendly interface that provides a seamless and inclusive experience for all users.',
          validation: {
            pattern: '.{20,}',
            required: true,
            errorMessage: 'Must be 20 charecter long.',
          },
        },
        {
          type: 'multi_line_text',
          labelTitle: 'Target Audience',
          labelDescription:
            'Describe the characteristics of your target audience and any specific accessibility considerations.',
          placeholder:
            'E.g., Users with visual impairments, motor disabilities, cognitive disabilities.',
          example:
            'Our target audience includes individuals with visual impairments, motor disabilities, and cognitive disabilities. We need to ensure our design is accessible to screen readers, supports keyboard navigation, and provides clear content.',
          validation: {
            pattern: '.{20,}',
            required: true,
            errorMessage: 'Must be 20 charecter long.',
          },
        },
        {
          type: 'file_upload',
          labelTitle: 'Design Materials',
          labelDescription:
            'Upload any existing design materials or prototypes to provide context for tailored recommendations.',
          buttonText: 'Upload Design Materials',
          validation: { pattern: '.*', required: false },
        },
        { type: 'button', buttonText: 'Get Accessibility Recommendations' },
      ],
      system_prompt:
        'As a UX Designer, your role in ensuring accessibility compliance is pivotal for creating an inclusive user experience. Your expertise in design principles and interaction considerations equips you to address the diverse needs of users with empathy and precision. Your approach to accessibility design reflects a commitment to barrier-free user experiences.\n\nIn response to your request, the AI will:\n\n1. Review your specified design goals to align recommendations with your vision for an inclusive user interface.\n2. Consider the characteristics and specific accessibility considerations of your target audience to tailor recommendations to their diverse needs.\n3. Utilize existing design materials or prototypes, if provided, to deliver context-aware and accurate accessibility recommendations.\n\nThe generated accessibility recommendations will be customized to your design goals, target audience, and existing materials, ensuring an inclusive and accessible user interface.',
      user_prompt:
        '# Ensuring Accessibility Compliance in User Interface Design\n\nAs a UX designer, your task is to ensure accessibility compliance in your user interface design. This includes creating an inclusive and accessible design that caters to users with different abilities. Our AI can provide expert guidance and recommendations to help you achieve accessibility compliance.\n\nFollow these steps to ensure accessibility in your user interface design:\n\n1. Design Goals: {{Design Goals}} \n2. Target Audience: {{Target Audience}}',
      icon: 'https://chat-preview.lobehub.com/_next/image?url=https%3A%2F%2Fregistry.npmmirror.com%2F%40lobehub%2Fassets-emoji-anim%2Flatest%2Ffiles%2Fassets%2Fman-technologist.webp&w=96&q=75',
    },
    {
      metadata: {
        jobTitle: '3D Generalist',
        taskName: 'AR Development: Develop AR applications or experiences',
        marketingText:
          'Empower your AR development process with AI-driven insights. Our tool offers foundational recommendations for creating immersive AR applications or experiences, focusing on design principles, user interface considerations, and interaction design.',
        limitations:
          'While the AI can provide general principles and recommendations for AR development, human expertise is crucial for the actual design and implementation. Specialized knowledge in AR development tools and technologies is essential for effective execution.',
      },
      modalComponents: [
        {
          type: 'multi_line_text',
          labelTitle: 'Development Goals',
          labelDescription:
            'What are the specific goals or objectives for developing the AR application or experience?',
          placeholder:
            'Describe the specific goals or objectives for developing the AR application or experience.',
          example:
            'Our goal is to create an AR application that enhances the museum experience by providing interactive historical visualizations.',
          validation: {
            pattern: '.{20,}',
            required: true,
            errorMessage: 'Must be 20 charecter long.',
          },
        },
        {
          type: 'multi_line_text',
          labelTitle: 'Target Audience',
          labelDescription: 'Who is the intended audience for the AR application or experience?',
          placeholder: 'Describe the intended audience for the AR application or experience.',
          example:
            'The target audience includes students and educators interested in interactive learning experiences.',
          validation: {
            pattern: '.{20,}',
            required: true,
            errorMessage: 'Must be 20 charecter long.',
          },
        },
        {
          type: 'multi_line_text',
          labelTitle: 'Key Features',
          labelDescription:
            'List the key features or functionalities you want to incorporate into the AR application or experience.',
          placeholder:
            'E.g., Interactive storytelling, 3D object recognition, Real-time information display.',
          example:
            'We aim to incorporate interactive storytelling, 3D object recognition, and real-time information display into the AR experience.',
          validation: {
            pattern: '.{20,}',
            required: true,
            errorMessage: 'Must be 20 charecter long.',
          },
        },
        { type: 'button', buttonText: 'Generate Development Guidelines' },
      ],
      system_prompt:
        'As a 3D Generalist, your expertise in crafting immersive AR experiences is invaluable. Your understanding of 3D modeling, animation, and interactive design allows you to create visually stunning and functionally compelling AR applications or experiences. Your role involves understanding user interaction, interface design, and the technical aspects of AR development, ensuring that your contributions captivate and engage users.\n\nYour responsibilities include:\n\n- **Immersive Experiences**: Your focus is on creating AR applications or experiences that provide captivating and engaging interactions, drawing on your expertise in 3D design and interactive storytelling.\n- **User-Centric Design**: You prioritize user experience, ensuring that the AR applications or experiences are intuitive, visually appealing, and seamlessly integrated into users\' environments.\n- **Technical Proficiency**: Your understanding of AR development tools and technologies bridges the gap between creative vision and technical implementation.\n- **Collaborative Mindset**: You excel in multidisciplinary collaboration, working closely with developers, designers, and stakeholders to bring AR concepts to life.\n\nTo proceed with generating the development guidelines, provide the specific goals or objectives for the AR application or experience, the intended audience, and the key features or functionalities you aim to incorporate into the AR application or experience. Based on this information, the AI will offer foundational recommendations for creating immersive AR applications or experiences.',
      user_prompt:
        '# AR Development: Creating Immersive Experiences\n\nYour task is to develop AR applications or experiences that captivate and engage users. The AI will provide foundational recommendations for creating immersive AR experiences based on the detailed input you provide. These recommendations will focus on design principles, user interface considerations, and interaction design.\n\nFollow these steps to complete the task:\n\n1. Define the specific goals or objectives for developing the AR application or experience.\n2. Describe the intended audience for the AR application or experience.\n3. List the key features or functionalities you want to incorporate into the AR application or experience.\n\n# Development Goals\n{{Development Goals}}\n\n# Target Audience\n{{Target Audience}}\n\n# Key Features\n{{Key Features}}\n\n# Generated Development Guidelines\n',
      icon: 'https://chat-preview.lobehub.com/_next/image?url=https%3A%2F%2Fregistry.npmmirror.com%2F%40lobehub%2Fassets-emoji-anim%2Flatest%2Ffiles%2Fassets%2Fmovie-camera.webp&w=96&q=75',
    },
    {
      metadata: {
        jobTitle: 'UX Designer',
        taskName: 'Accessibility Design: Ensure Accessibility Compliance',
        marketingText:
          'Empower your user interface design with AI-driven accessibility compliance. Leverage expert guidance and tailored recommendations to create an inclusive and accessible user experience.',
        limitations:
          'While AI can offer insights and recommendations for accessibility compliance, human expertise is essential for the nuanced implementation and customization of design elements to cater to specific user needs and abilities.',
      },
      modalComponents: [
        {
          type: 'multi_line_text',
          labelTitle: 'Design Goals',
          labelDescription:
            'Specify your design goals for the user interface and what you aim to achieve.',
          placeholder:
            'E.g., Create an intuitive interface accessible to all users, regardless of their abilities.',
          example:
            'Our design goals are to ensure an intuitive and user-friendly interface that provides a seamless and inclusive experience for all users.',
          validation: {
            pattern: '.{20,}',
            required: true,
            errorMessage: 'Must be 20 charecter long.',
          },
        },
        {
          type: 'multi_line_text',
          labelTitle: 'Target Audience',
          labelDescription:
            'Describe the characteristics of your target audience and any specific accessibility considerations.',
          placeholder:
            'E.g., Users with visual impairments, motor disabilities, cognitive disabilities.',
          example:
            'Our target audience includes individuals with visual impairments, motor disabilities, and cognitive disabilities. We need to ensure our design is accessible to screen readers, supports keyboard navigation, and provides clear content.',
          validation: {
            pattern: '.{20,}',
            required: true,
            errorMessage: 'Must be 20 charecter long.',
          },
        },
        {
          type: 'file_upload',
          labelTitle: 'Design Materials',
          labelDescription:
            'Upload any existing design materials or prototypes to provide context for tailored recommendations.',
          buttonText: 'Upload Design Materials',
          validation: { pattern: '.*', required: false },
        },
        { type: 'button', buttonText: 'Get Accessibility Recommendations' },
      ],
      system_prompt:
        'As a UX Designer, your role in ensuring accessibility compliance is pivotal for creating an inclusive user experience. Your expertise in design principles and interaction considerations equips you to address the diverse needs of users with empathy and precision. Your approach to accessibility design reflects a commitment to barrier-free user experiences.\n\nIn response to your request, the AI will:\n\n1. Review your specified design goals to align recommendations with your vision for an inclusive user interface.\n2. Consider the characteristics and specific accessibility considerations of your target audience to tailor recommendations to their diverse needs.\n3. Utilize existing design materials or prototypes, if provided, to deliver context-aware and accurate accessibility recommendations.\n\nThe generated accessibility recommendations will be customized to your design goals, target audience, and existing materials, ensuring an inclusive and accessible user interface.',
      user_prompt:
        '# Ensuring Accessibility Compliance in User Interface Design\n\nAs a UX designer, your task is to ensure accessibility compliance in your user interface design. This includes creating an inclusive and accessible design that caters to users with different abilities. Our AI can provide expert guidance and recommendations to help you achieve accessibility compliance.\n\nFollow these steps to ensure accessibility in your user interface design:\n\n1. Design Goals: {{Design Goals}} \n2. Target Audience: {{Target Audience}}',
      icon: 'https://chat-preview.lobehub.com/_next/image?url=https%3A%2F%2Fregistry.npmmirror.com%2F%40lobehub%2Fassets-emoji-anim%2Flatest%2Ffiles%2Fassets%2Fman-technologist.webp&w=96&q=75',
    },
    {
      metadata: {
        jobTitle: '3D Generalist',
        taskName: 'AR Development: Develop AR applications or experiences',
        marketingText:
          'Empower your AR development process with AI-driven insights. Our tool offers foundational recommendations for creating immersive AR applications or experiences, focusing on design principles, user interface considerations, and interaction design.',
        limitations:
          'While the AI can provide general principles and recommendations for AR development, human expertise is crucial for the actual design and implementation. Specialized knowledge in AR development tools and technologies is essential for effective execution.',
      },
      modalComponents: [
        {
          type: 'multi_line_text',
          labelTitle: 'Development Goals',
          labelDescription:
            'What are the specific goals or objectives for developing the AR application or experience?',
          placeholder:
            'Describe the specific goals or objectives for developing the AR application or experience.',
          example:
            'Our goal is to create an AR application that enhances the museum experience by providing interactive historical visualizations.',
          validation: {
            pattern: '.{20,}',
            required: true,
            errorMessage: 'Must be 20 charecter long.',
          },
        },
        {
          type: 'multi_line_text',
          labelTitle: 'Target Audience',
          labelDescription: 'Who is the intended audience for the AR application or experience?',
          placeholder: 'Describe the intended audience for the AR application or experience.',
          example:
            'The target audience includes students and educators interested in interactive learning experiences.',
          validation: {
            pattern: '.{20,}',
            required: true,
            errorMessage: 'Must be 20 charecter long.',
          },
        },
        {
          type: 'multi_line_text',
          labelTitle: 'Key Features',
          labelDescription:
            'List the key features or functionalities you want to incorporate into the AR application or experience.',
          placeholder:
            'E.g., Interactive storytelling, 3D object recognition, Real-time information display.',
          example:
            'We aim to incorporate interactive storytelling, 3D object recognition, and real-time information display into the AR experience.',
          validation: {
            pattern: '.{20,}',
            required: true,
            errorMessage: 'Must be 20 charecter long.',
          },
        },
        { type: 'button', buttonText: 'Generate Development Guidelines' },
      ],
      system_prompt:
        'As a 3D Generalist, your expertise in crafting immersive AR experiences is invaluable. Your understanding of 3D modeling, animation, and interactive design allows you to create visually stunning and functionally compelling AR applications or experiences. Your role involves understanding user interaction, interface design, and the technical aspects of AR development, ensuring that your contributions captivate and engage users.\n\nYour responsibilities include:\n\n- **Immersive Experiences**: Your focus is on creating AR applications or experiences that provide captivating and engaging interactions, drawing on your expertise in 3D design and interactive storytelling.\n- **User-Centric Design**: You prioritize user experience, ensuring that the AR applications or experiences are intuitive, visually appealing, and seamlessly integrated into users\' environments.\n- **Technical Proficiency**: Your understanding of AR development tools and technologies bridges the gap between creative vision and technical implementation.\n- **Collaborative Mindset**: You excel in multidisciplinary collaboration, working closely with developers, designers, and stakeholders to bring AR concepts to life.\n\nTo proceed with generating the development guidelines, provide the specific goals or objectives for the AR application or experience, the intended audience, and the key features or functionalities you aim to incorporate into the AR application or experience. Based on this information, the AI will offer foundational recommendations for creating immersive AR applications or experiences.',
      user_prompt:
        '# AR Development: Creating Immersive Experiences\n\nYour task is to develop AR applications or experiences that captivate and engage users. The AI will provide foundational recommendations for creating immersive AR experiences based on the detailed input you provide. These recommendations will focus on design principles, user interface considerations, and interaction design.\n\nFollow these steps to complete the task:\n\n1. Define the specific goals or objectives for developing the AR application or experience.\n2. Describe the intended audience for the AR application or experience.\n3. List the key features or functionalities you want to incorporate into the AR application or experience.\n\n# Development Goals\n{{Development Goals}}\n\n# Target Audience\n{{Target Audience}}\n\n# Key Features\n{{Key Features}}\n\n# Generated Development Guidelines\n',
      icon: 'https://chat-preview.lobehub.com/_next/image?url=https%3A%2F%2Fregistry.npmmirror.com%2F%40lobehub%2Fassets-emoji-anim%2Flatest%2Ffiles%2Fassets%2Fmovie-camera.webp&w=96&q=75',
    },
    {
      metadata: {
        jobTitle: 'UX Designer',
        taskName: 'Accessibility Design: Ensure Accessibility Compliance',
        marketingText:
          'Empower your user interface design with AI-driven accessibility compliance. Leverage expert guidance and tailored recommendations to create an inclusive and accessible user experience.',
        limitations:
          'While AI can offer insights and recommendations for accessibility compliance, human expertise is essential for the nuanced implementation and customization of design elements to cater to specific user needs and abilities.',
      },
      modalComponents: [
        {
          type: 'multi_line_text',
          labelTitle: 'Design Goals',
          labelDescription:
            'Specify your design goals for the user interface and what you aim to achieve.',
          placeholder:
            'E.g., Create an intuitive interface accessible to all users, regardless of their abilities.',
          example:
            'Our design goals are to ensure an intuitive and user-friendly interface that provides a seamless and inclusive experience for all users.',
          validation: {
            pattern: '.{20,}',
            required: true,
            errorMessage: 'Must be 20 charecter long.',
          },
        },
        {
          type: 'multi_line_text',
          labelTitle: 'Target Audience',
          labelDescription:
            'Describe the characteristics of your target audience and any specific accessibility considerations.',
          placeholder:
            'E.g., Users with visual impairments, motor disabilities, cognitive disabilities.',
          example:
            'Our target audience includes individuals with visual impairments, motor disabilities, and cognitive disabilities. We need to ensure our design is accessible to screen readers, supports keyboard navigation, and provides clear content.',
          validation: {
            pattern: '.{20,}',
            required: true,
            errorMessage: 'Must be 20 charecter long.',
          },
        },
        {
          type: 'file_upload',
          labelTitle: 'Design Materials',
          labelDescription:
            'Upload any existing design materials or prototypes to provide context for tailored recommendations.',
          buttonText: 'Upload Design Materials',
          validation: { pattern: '.*', required: false },
        },
        { type: 'button', buttonText: 'Get Accessibility Recommendations' },
      ],
      system_prompt:
        'As a UX Designer, your role in ensuring accessibility compliance is pivotal for creating an inclusive user experience. Your expertise in design principles and interaction considerations equips you to address the diverse needs of users with empathy and precision. Your approach to accessibility design reflects a commitment to barrier-free user experiences.\n\nIn response to your request, the AI will:\n\n1. Review your specified design goals to align recommendations with your vision for an inclusive user interface.\n2. Consider the characteristics and specific accessibility considerations of your target audience to tailor recommendations to their diverse needs.\n3. Utilize existing design materials or prototypes, if provided, to deliver context-aware and accurate accessibility recommendations.\n\nThe generated accessibility recommendations will be customized to your design goals, target audience, and existing materials, ensuring an inclusive and accessible user interface.',
      user_prompt:
        '# Ensuring Accessibility Compliance in User Interface Design\n\nAs a UX designer, your task is to ensure accessibility compliance in your user interface design. This includes creating an inclusive and accessible design that caters to users with different abilities. Our AI can provide expert guidance and recommendations to help you achieve accessibility compliance.\n\nFollow these steps to ensure accessibility in your user interface design:\n\n1. Design Goals: {{Design Goals}} \n2. Target Audience: {{Target Audience}}',
      icon: 'https://chat-preview.lobehub.com/_next/image?url=https%3A%2F%2Fregistry.npmmirror.com%2F%40lobehub%2Fassets-emoji-anim%2Flatest%2Ffiles%2Fassets%2Fman-technologist.webp&w=96&q=75',
    },
  ];

  const searchResultAll = presets.map((val, index) => ({
    item: Object.assign(val, {}),
    refIndex: index,
    matches: [],
    score: 1,
  }));

  const [searchTerm, setSarchTerm] = useState('');
  const [searchResult, setSearchResult] = useState<FuseResult<Preset>[]>(searchResultAll);
  const [selectedPreset, setSelectedPreset] = useState<Preset>();
  const [lastChangeTime, setLastChangeTime] = useState(Date.now());

  const fuse = new Fuse(presets, {
    keys: ['metadata.jobTitle', 'metadata.taskName', 'metadata.marketingText'],
    includeScore: true,
  });

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSarchTerm(e.target.value);
    if (!e.target.value) {
      return setSearchResult(searchResultAll);
    }
    const result = fuse.search(e.target.value);
    setSearchResult(result);
    setLastChangeTime(Date.now());
  };

  const searchParmas = new Map();

  location.search
    .slice(1)
    .split('&')
    .map((i) => searchParmas.set(i.split('=')[0], i.split('=')[1]));

  return (
    <div className="h-screen overflow-y-scroll">
      <div className="sticky top-0 z-10 grid h-auto w-full grid-cols-[1fr_auto_1fr] place-content-center justify-between border-b border-gray-600 bg-white/70 p-3 backdrop-blur-md dark:bg-gray-800/70 dark:text-white">
        <Button
          onClick={() => {
            const redirectPath = decodeURIComponent(searchParmas.get('redirectPath'));
            if (redirectPath) {
              return navigate(redirectPath, { replace: true });
            }
            navigate('/c/new', { replace: true });
          }}
          size="icon"
          variant="outline"
          className="dark:bg-gray-700 dark:hover:bg-gray-600"
        >
          <ChevronLeft />
        </Button>
        <h1 className="font-mono text-2xl font-bold ">Promt Marketplace</h1>
        <div></div>
      </div>
      <div className={`grid ${selectedPreset ? 'sm:grid-cols-[auto_25rem]' : null}`}>
        <div className={`${selectedPreset ? 'hidden sm:block' : null}`}>
          <div className="mx-auto w-full max-w-7xl  p-4 pt-12">
            <h1 className="bg-gradient-to-b from-neutral-900 to-neutral-500 bg-clip-text text-center text-4xl font-bold text-transparent dark:bg-opacity-50 dark:from-neutral-50 dark:to-neutral-400 md:text-6xl">
              Find & Use <br /> The Best Agents
            </h1>
          </div>

          <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 md:px-6">
            <Input
              value={searchTerm}
              onChange={handleSearch}
              placeholder="Search prompts"
              className="border-0 border-gray-500 bg-gray-100 focus:border focus:bg-gray-200 dark:bg-gray-750 dark:focus:bg-gray-600"
            />
            <div className="grid grid-cols-[repeat(auto-fill,_minmax(17rem,_1fr))] gap-4">
              {searchResult.map((result) => (
                <PresetCard
                  key={result.refIndex}
                  setSelectedPreset={setSelectedPreset}
                  preset={result.item}
                />
              ))}
            </div>
          </div>
        </div>
        {selectedPreset ? (
          <PresetSidebar setSelectedPreset={setSelectedPreset} preset={selectedPreset} />
        ) : null}
      </div>
    </div>
  );
}

export default MarketplaceView;
