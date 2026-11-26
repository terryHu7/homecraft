export const defaultOffice = {
  resume: {
    title: 'Aswin Raj K C',
    subtitle: 'Full Stack MERN Developer',
    summary: 'B.Sc. Computer Science graduate building and deploying web applications with React, Node.js, Express, and MongoDB.',
    education: 'B.Sc. Computer Science · Safi Institute of Advanced Study, University of Calicut · 2023–2026',
    image: '',
  },
  experience: [
    { title: 'Full Stack Developer Intern · Febno Technologies', detail: 'June 2026 – Present · Kozhikode\nDeveloping the React frontend for the Reception and Doctor modules of a clinic management system, including patient-handling and doctor-side workflows.', link: '' },
    { title: 'MERN Stack Development Trainee · Nexus Technologies', detail: 'August 2025 – January 2026 · Calicut\nCompleted six months of MERN development training and built WoofTale with User, Doctor, Admin, and Shop modules.', link: '' },
  ],
  skills: [
    { title: 'Frontend', detail: 'React, JavaScript (ES6+), HTML, CSS, Bootstrap, and responsive web design.', link: '' },
    { title: 'Backend and databases', detail: 'Node.js, Express, REST APIs, JWT authentication, role-based access control, MongoDB, and Mongoose.', link: '' },
    { title: 'Tools and deployment', detail: 'Git, GitHub, Postman, npm, Vercel, Render, Cloudflare, and AWS fundamentals. Also works with Python and C.', link: '' },
  ],
  projects: [
    { title: 'Katha', detail: 'MERN story-sharing platform with publishing, likes, comments, JWT authentication, and Cloudinary uploads. Deployed on Vercel and Render.', link: 'https://katha.aswinraj.dev' },
    { title: 'WoofTale', detail: 'Full-stack pet care management with User, Doctor, Admin, and Shop modules backed by MongoDB.', link: 'https://github.com/aswinrajkallil/WoofTale' },
    { title: 'Clinic Management System', detail: 'React interfaces for patient handling and doctor-side operations, built during the Febno internship.', link: 'https://github.com/aswinrajkallil/clinic' },
  ],
  photos: ['', '', ''],
  libraryPaintings: ['', ''],
};

export async function getOffice() {
  try {
    const response = await fetch('/api/office');
    if (response.ok && response.headers.get('content-type')?.includes('application/json')) return await response.json();
  } catch {}
  return structuredClone(defaultOffice);
}
